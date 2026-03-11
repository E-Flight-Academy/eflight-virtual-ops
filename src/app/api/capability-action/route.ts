import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getCapabilitiesForRoles } from "@/lib/role-access";
import { getInstructorBookingsExpanded, getBookingDetail, getUserDocuments, getDocumentValidities, getAircraftStatus, getStudentLessonHistory, getCourseLessonPlans, type WingsBooking } from "@/lib/wings";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { queryDocuments } from "@/lib/vector";
import { getFoldersForRoles } from "@/lib/role-access";
import { getKvWingsSchedule, setKvWingsSchedule, getKvStudentLessons, setKvStudentLessons } from "@/lib/kv-cache";
import type { ScheduleDay, ScheduleBooking, BookingDetail, BookingLesson, BookingFlight, UserDocuments, DocumentValidity, AircraftStatus, AircraftRemark, PreviousLesson, LessonRecord } from "@/types/chat";

const requestSchema = z.object({
  action: z.string().min(1).max(100),
  bookingId: z.number().int().positive().optional(),
  courseId: z.number().int().positive().optional(),
  previousLessonBookingId: z.number().int().positive().optional(),
  studentUserId: z.number().int().positive().optional(),
  studentCustomerId: z.number().int().positive().optional(),
  studentName: z.string().max(200).optional(),
  endPrompt: z.string().max(5000).optional(),
  userEmail: z.string().email().max(200).optional(),
  roleOverride: z.array(z.string().max(50)).optional(),
});

const DEBUG_OVERRIDE_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "milos@eflight.nl"];

function bookingsToScheduleDays(bookings: WingsBooking[]): ScheduleDay[] {
  const byDate = new Map<string, WingsBooking[]>();
  for (const b of bookings) {
    if (b.status.name === "Declined") continue;
    const date = b.from.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(b);
  }

  const days: ScheduleDay[] = [];
  for (const [date, dateBookings] of byDate) {
    days.push({
      date,
      wingsLink: `https://eflight.oywings.com/bookings?date=${date}`,
      bookings: dateBookings.map((b): ScheduleBooking => {
        // Student: prefer user field, fall back to customer, then parse from comments
        let studentFull = b.user?.name || b.customer?.name || "";
        if (!studentFull && b.comments) {
          const lines = b.comments.split("\n").map((l) => l.trim());
          const nameLine = lines.find(
            (l) => l.length > 3 && !l.includes(":") && !l.toLowerCase().startsWith("airfield"),
          );
          if (nameLine) studentFull = nameLine;
        }

        const lesson = b.lessons?.[0];
        return {
          id: b.id,
          timeFrom: b.from.slice(11, 16),
          timeTo: b.to.slice(11, 16),
          type: b.type.name,
          student: b.eventTitle || b.user?.name || b.customer?.name || "—",
          studentFull: studentFull || b.eventTitle || "—",
          aircraft: b.aircraft?.callSign || "—",
          status: b.status.name,
          comments: b.comments,
          lessonPlan: lesson?.plan?.name || null,
          lessonStatus: lesson?.status?.name || null,
          isAssessment: lesson?.plan?.isAssessment || false,
        };
      }),
    });
  }

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action, bookingId, userEmail: userEmailOverride, roleOverride } = parsed.data;

    // Resolve user identity + capabilities (same pattern as /api/chat)
    let capabilities: string[] = [];
    let wingsUserId: number | null = null;

    const wantsOverride = roleOverride?.length || userEmailOverride;
    let sessionForOverrideCheck: { customer?: { email?: string }; accessToken: string } | null = null;
    if (wantsOverride) {
      try { sessionForOverrideCheck = await getSession(); } catch { /* no session */ }
    }
    const isDebugAllowed = process.env.NODE_ENV !== "production"
      ? true
      : sessionForOverrideCheck?.customer?.email
        ? DEBUG_OVERRIDE_EMAILS.includes(sessionForOverrideCheck.customer.email.toLowerCase())
        : false;

    if (isDebugAllowed && wantsOverride) {
      if (userEmailOverride) {
        const userData = await getUserData(userEmailOverride);
        wingsUserId = userData.wingsUserId;
        const userRoles = roleOverride?.length ? roleOverride : userData.roles;
        capabilities = await getCapabilitiesForRoles(userRoles);
      } else {
        capabilities = await getCapabilitiesForRoles(roleOverride!);
        wingsUserId = 1062;
      }
    } else {
      try {
        const session = sessionForOverrideCheck ?? await getSession();
        if (session?.customer?.email) {
          const userData = await getUserData(session.customer.email);
          wingsUserId = userData.wingsUserId;
          capabilities = await getCapabilitiesForRoles(userData.roles);
        }
      } catch {
        // no session
      }
    }

    // Dispatch by action

    // Lightweight course plans lookup — used by sub-flow to resolve previous lesson name
    if (action === "course-plans") {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const courseId = parsed.data.courseId;
      if (!courseId) {
        return NextResponse.json({ error: "courseId is required" }, { status: 400 });
      }
      const plans = await getCourseLessonPlans(courseId);
      return NextResponse.json({
        plans: plans.map((p) => ({ id: p.id, sequence: p.sequence, name: p.name, isAssessment: p.isAssessment })),
      });
    }

    if (action === "instructor-schedule") {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (!wingsUserId) {
        return NextResponse.json({ error: "Wings user not configured" }, { status: 400 });
      }

      // Try Redis cache first
      let bookings = await getKvWingsSchedule(wingsUserId);
      if (!bookings) {
        bookings = await getInstructorBookingsExpanded(wingsUserId);
        await setKvWingsSchedule(wingsUserId, bookings);
      }

      const days = bookingsToScheduleDays(bookings);
      const totalBookings = days.reduce((sum, d) => sum + d.bookings.length, 0);
      const summary = `${totalBookings} lesson${totalBookings !== 1 ? "s" : ""} over ${days.length} day${days.length !== 1 ? "s" : ""}`;

      return NextResponse.json({
        type: "schedule",
        data: days,
        summary,
      });
    }

    if (action === "booking-detail") {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (!bookingId) {
        return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
      }

      const raw = await getBookingDetail(bookingId);
      if (!raw) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }

      const date = raw.from.slice(0, 10);

      // Resolve the student: prefer user, but if user is the instructor, fall back to customer
      const studentUser = (raw.user && raw.instructor && raw.user.id === raw.instructor.id)
        ? raw.customer
        : raw.user || raw.customer;
      const docUserIds: { id: number; name: string }[] = [];
      if (studentUser?.id) docUserIds.push({ id: studentUser.id, name: studentUser.name });
      if (raw.instructor?.id) docUserIds.push({ id: raw.instructor.id, name: raw.instructor.name });

      const callSign = raw.aircraft?.callSign || null;

      // Resolve course context: either from the booking's lesson plan, or from student history
      const firstLesson = raw.lessons[0];
      const hasCourse = firstLesson?.plan?.id && firstLesson.plan.course?.id;

      const [docResults, acStatus, coursePlansForPrev, studentHistoryInitial] = await Promise.all([
        Promise.all(docUserIds.map((u) => getUserDocuments(u.id))),
        callSign ? getAircraftStatus(callSign) : Promise.resolve(null),
        hasCourse ? getCourseLessonPlans(firstLesson.plan!.course!.id) : Promise.resolve([]),
        // Fetch student history: needed both for inferring course when no plan, and for resolving previous lesson booking
        studentUser?.id ? getStudentLessonHistory(studentUser.id, 30) : Promise.resolve([]),
      ]);

      // Fallback: if student history is empty, try the other ID (user vs customer)
      let studentHistory = studentHistoryInitial;
      if (studentHistory.length === 0) {
        const altId = studentUser?.id === raw.user?.id ? raw.customer?.id : raw.user?.id;
        if (altId && altId !== studentUser?.id) {
          studentHistory = await getStudentLessonHistory(altId, 30);
        }
      }

      let previousLesson: PreviousLesson | null = null;
      // Extra fields to enrich the booking when lesson plan is missing
      let inferredCourseId: number | null = null;
      let inferredCourseName: string | null = null;
      let inferredPlanId: number | null = null;
      let inferredPlanName: string | null = null;

      if (hasCourse && coursePlansForPrev.length > 0) {
        // Booking has a lesson plan — find previous in course sequence
        const currentIdx = coursePlansForPrev.findIndex((p) => p.id === firstLesson.plan!.id);
        if (currentIdx > 0) {
          const prevPlan = coursePlansForPrev[currentIdx - 1];
          // Look up the actual booking for this plan from student history
          const prevBooking = studentHistory.find((h) => h.planId === prevPlan.id);
          if (prevBooking) {
            previousLesson = {
              bookingId: prevBooking.bookingId,
              date: prevBooking.date,
              planName: prevPlan.name,
              isAssessment: prevPlan.isAssessment,
              status: prevBooking.status,
              records: [],
            };
          } else {
            // Plan exists in course but student hasn't done it yet — show as info only
            previousLesson = null;
          }
        }
      } else if (studentHistory.length > 0) {
        // No lesson plan on booking — infer from student's most recent lesson with a course
        const lastWithCourse = studentHistory.find((l) => l.courseId && l.planId);
        if (lastWithCourse) {
          inferredCourseId = lastWithCourse.courseId;
          inferredCourseName = lastWithCourse.courseName;
          // Fetch course plans to find the next lesson after the student's last one
          const coursePlans = await getCourseLessonPlans(lastWithCourse.courseId!);
          const lastIdx = coursePlans.findIndex((p) => p.id === lastWithCourse.planId);
          if (lastIdx >= 0 && lastIdx < coursePlans.length - 1) {
            // Next lesson in course = the one this booking is probably for
            const nextPlan = coursePlans[lastIdx + 1];
            inferredPlanId = nextPlan.id;
            inferredPlanName = nextPlan.name;
            // The "previous lesson" is the student's last completed one
            previousLesson = {
              bookingId: lastWithCourse.bookingId,
              date: lastWithCourse.date,
              planName: lastWithCourse.planName || "—",
              isAssessment: lastWithCourse.isAssessment,
              status: lastWithCourse.status,
              records: [],
            };
          }
        }
      }

      // Fetch previous lesson records (scores + hot items) if we found a previous booking
      if (previousLesson && previousLesson.bookingId > 0) {
        try {
          const prevRaw = await getBookingDetail(previousLesson.bookingId);
          if (prevRaw?.lessons?.length) {
            const allRecords: LessonRecord[] = [];
            for (const l of prevRaw.lessons) {
              for (const r of l.records || []) {
                allRecords.push({
                  objectiveSummary: r.objective?.summary || "—",
                  categoryName: r.objective?.category?.name || "—",
                  score: r.score,
                  comments: r.comments || null,
                });
              }
            }
            previousLesson.records = allRecords;
          }
        } catch { /* non-critical — show previous lesson without records */ }
      }

      const now = new Date();
      const userDocuments: UserDocuments[] = docResults
        .map((result, i) => {
          if (!result) return null;
          const validities = getDocumentValidities(result.documents);
          const top3: DocumentValidity[] = validities.slice(0, 3).map((d) => {
            const expiresStr = d.expires!.slice(0, 10);
            const expiresDate = new Date(expiresStr + "T00:00:00");
            const daysRemaining = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return {
              name: d.type.name,
              filename: d.file?.originalFilename || undefined,
              expires: expiresStr,
              daysRemaining,
              isExpired: d.isExpired,
            };
          });
          return {
            userName: docUserIds[i].name,
            documents: top3,
          };
        })
        .filter((d): d is UserDocuments => d !== null && d.documents.length > 0);

      // Build aircraft status
      let aircraftStatus: AircraftStatus | null = null;
      if (acStatus) {
        const acDocValidities = getDocumentValidities(acStatus.documents);
        const acDocs: DocumentValidity[] = acDocValidities.slice(0, 3).map((d) => {
          const expiresStr = d.expires!.slice(0, 10);
          const expiresDate = new Date(expiresStr + "T00:00:00");
          const daysRemaining = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return { name: d.type.name, filename: d.file?.originalFilename || undefined, expires: expiresStr, daysRemaining, isExpired: d.isExpired };
        });

        const openRemarks: AircraftRemark[] = acStatus.remarks
          .filter((r) => !r.releasedAt && r.remark)
          .map((r) => {
            const createdDate = new Date(r.createdAt);
            const daysAgo = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
            return {
              id: r.id,
              remark: r.remark!,
              createdAt: r.createdAt.slice(0, 10),
              daysAgo,
              isNew: daysAgo <= 3,
              isOpen: true,
            };
          })
          .sort((a, b) => a.daysAgo - b.daysAgo);

        aircraftStatus = {
          callSign: acStatus.callSign,
          serviceable: acStatus.serviceable,
          documents: acDocs,
          openRemarks,
        };
      }

      const detail: BookingDetail = {
        id: raw.id,
        date,
        timeFrom: raw.from.slice(11, 16),
        timeTo: raw.to.slice(11, 16),
        type: raw.type.name,
        status: raw.status.name,
        student: studentUser?.name || raw.eventTitle || "—",
        studentUserId: raw.user?.id || null,
        studentCustomerId: raw.customer?.id || null,
        studentEmail: studentUser?.email || null,
        instructor: raw.instructor?.name || "—",
        aircraft: raw.aircraft?.callSign || "—",
        comments: raw.comments,
        wingsLink: `https://eflight.oywings.com/bookings?date=${date}`,
        lessons: raw.lessons.map((l): BookingLesson => ({
          id: l.id,
          planId: l.plan?.id || inferredPlanId,
          planName: l.plan?.name || inferredPlanName,
          courseId: l.plan?.course?.id || inferredCourseId,
          courseName: l.plan?.course?.name || inferredCourseName,
          isAssessment: l.plan?.isAssessment || false,
          description: l.plan?.description || null,
          prep: l.plan?.prep || null,
          briefing: l.plan?.briefing || null,
          status: l.status?.name || null,
          comments: l.comments,
          flights: l.flights.map((f): BookingFlight => ({
            id: f.id,
            departName: f.depart?.icaoName || f.depart?.name || "—",
            arriveName: f.arrive?.icaoName || f.arrive?.name || "—",
            offBlock: f.offBlock,
            onBlock: f.onBlock,
            airborne: f.airborne,
            touchdown: f.touchdown,
            comments: f.comments,
          })),
          records: (l.records || []).map((r): LessonRecord => ({
            objectiveSummary: r.objective?.summary || "—",
            categoryName: r.objective?.category?.name || "—",
            score: r.score,
            comments: r.comments || null,
          })),
        })),
        report: raw.report ? {
          remarks: raw.report.remarks,
          landings: raw.report.landings,
          fuelLtrs: raw.report.fuelLtrs,
        } : null,
        userDocuments,
        aircraftStatus,
        previousLesson,
      };

      const timeStr = `${detail.timeFrom}–${detail.timeTo}`;
      const summary = `${detail.student} · ${timeStr} · ${detail.type}`;

      return NextResponse.json({
        type: "booking-detail",
        data: detail,
        summary,
      });
    }

    if (action === "performance-summary") {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const { studentUserId: suid, studentName } = parsed.data;
      if (!suid) {
        return NextResponse.json({ error: "studentUserId is required" }, { status: 400 });
      }

      // Try Redis cache first
      let lessons = await getKvStudentLessons(suid);
      if (!lessons) {
        lessons = await getStudentLessonHistory(suid, 10);
        await setKvStudentLessons(suid, lessons);
      }

      // Build TOON-style tabular context for Gemini (token efficient)
      const lines: string[] = [
        `=== Lesson History for ${studentName || "Student"} (${lessons.length} lessons) ===`,
        "date\tplan\tstatus\tinstructor\taircraft\tcomments",
      ];
      for (const l of lessons) {
        lines.push(`${l.date}\t${l.planName || "—"}\t${l.status || "?"}\t${l.instructor || "?"}\t${l.aircraft || "?"}\t${l.comments?.replace(/\n/g, "; ") || ""}`);
        if (l.records.length > 0) {
          lines.push("  scores: objective\tscore\tnotes");
          for (const r of l.records) {
            if (r.score !== null) {
              lines.push(`  ${r.objectiveSummary}\t${r.score}/5\t${r.comments || ""}`);
            }
          }
        }
      }

      return NextResponse.json({
        type: "performance-context",
        context: lines.join("\n"),
        studentName: studentName || "Student",
        lessonCount: lessons.length,
      });
    }

    if (action === "lesson-summary" || action === "current-lesson-summary") {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const { previousLessonBookingId: plbId, bookingId: bId, studentName } = parsed.data;
      const targetId = action === "current-lesson-summary" ? bId : plbId;
      if (!targetId) {
        return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
      }

      const raw = await getBookingDetail(targetId);
      if (!raw) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }

      const lesson = raw.lessons[0];
      const lines: string[] = [`=== Lesson Detail for ${studentName || "Student"} ===`];
      lines.push(`date\ttime\ttype\tstatus\tinstructor\taircraft`);
      lines.push(`${raw.from.slice(0, 10)}\t${raw.from.slice(11, 16)}–${raw.to.slice(11, 16)}\t${raw.type.name}\t${raw.status.name}\t${raw.instructor?.name || "—"}\t${raw.aircraft?.callSign || "—"}`);
      if (raw.comments) lines.push(`comments: ${raw.comments}`);
      if (lesson) {
        if (lesson.plan?.name) lines.push(`plan: ${lesson.plan.name}${lesson.plan.isAssessment ? " (Assessment)" : ""}`);
        if (lesson.plan?.description) lines.push(`description: ${lesson.plan.description}`);
        if (lesson.status?.name) lines.push(`lesson_status: ${lesson.status.name}`);
        if (lesson.comments) lines.push(`instructor_notes: ${lesson.comments}`);
        if (lesson.records && lesson.records.length > 0) {
          lines.push("scores: objective\tscore\tnotes");
          for (const r of lesson.records) {
            if (r.score !== null) {
              lines.push(`${r.objective?.summary || "—"}\t${r.score}/5\t${r.comments || ""}`);
            }
          }
        }
        if (lesson.flights && lesson.flights.length > 0) {
          lines.push("flights: from\tto\tcomments");
          for (const f of lesson.flights) {
            lines.push(`${f.depart?.icaoName || f.depart?.name || "—"}\t${f.arrive?.icaoName || f.arrive?.name || "—"}\t${f.comments || ""}`);
          }
        }
      }

      return NextResponse.json({
        type: "lesson-context",
        context: lines.join("\n"),
        studentName: studentName || "Student",
      });
    }

    if (action === "doc-validity") {
      if (!capabilities.includes("doc-validity")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (!wingsUserId) {
        return NextResponse.json({ error: "Wings user not configured" }, { status: 400 });
      }

      const result = await getUserDocuments(wingsUserId);
      if (!result || !result.documents.length) {
        return NextResponse.json({
          type: "doc-validity",
          data: { userName: result?.userName || "User", documents: [] },
          summary: "No documents found",
        });
      }

      const now = new Date();
      const validities = getDocumentValidities(result.documents);
      const documents = validities.map((d) => {
        const expiresStr = d.expires!.slice(0, 10);
        const expiresDate = new Date(expiresStr + "T00:00:00");
        const daysRemaining = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          name: d.type.name,
          filename: d.file?.originalFilename || undefined,
          expires: expiresStr,
          daysRemaining,
          isExpired: d.isExpired,
        };
      });

      const expired = documents.filter((d) => d.isExpired).length;
      const expiringSoon = documents.filter((d) => !d.isExpired && d.daysRemaining <= 30).length;
      const parts: string[] = [`${documents.length} documents`];
      if (expired) parts.push(`${expired} expired`);
      if (expiringSoon) parts.push(`${expiringSoon} expiring soon`);

      return NextResponse.json({
        type: "doc-validity",
        data: { userName: result.userName, documents },
        summary: parts.join(" · "),
      });
    }

    if (action === "student-lessons") {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const { studentUserId: suid, studentCustomerId: scid, studentName } = parsed.data;
      if (!suid && !scid) {
        return NextResponse.json({ error: "studentUserId or studentCustomerId is required" }, { status: 400 });
      }

      // Try Redis cache first, otherwise fetch all lessons (3 year window)
      // Try userId first, fall back to customerId if no results
      const lookupId = suid || scid!;
      let lessons = await getKvStudentLessons(lookupId);
      const staleCache = lessons && lessons.length > 0 && (
        !lessons[0].courseName || lessons[0].courseName === "Lesson"
      );
      if (!lessons || staleCache) {
        lessons = await getStudentLessonHistory(lookupId);
        // If userId returned nothing and we have a different customerId, try that
        if (lessons.length === 0 && scid && suid && scid !== suid) {
          lessons = await getStudentLessonHistory(scid);
          if (lessons.length > 0) await setKvStudentLessons(scid, lessons);
        } else {
          await setKvStudentLessons(lookupId, lessons);
        }
      }

      // Group by course (booking type, e.g. "Night Rating", "PPL"), sorted newest first within each course
      const courseMap = new Map<string, typeof lessons>();
      for (const l of lessons) {
        const key = l.courseName || "Other";
        if (!courseMap.has(key)) courseMap.set(key, []);
        courseMap.get(key)!.push(l);
      }

      // Sort courses: most recent lesson date first
      const coursesArr = [...courseMap.entries()].sort((a, b) => {
        const aDate = a[1][0]?.date || "";
        const bDate = b[1][0]?.date || "";
        return bDate.localeCompare(aDate);
      });

      const courses = coursesArr.map(([courseName, courseLessons]) => ({
        courseName,
        lessons: courseLessons.map((l) => {
          const scores = l.records.map((r) => r.score).filter((s): s is number => s !== null);
          return {
            bookingId: l.bookingId,
            date: l.date,
            planName: l.planName,
            isAssessment: l.isAssessment,
            status: l.status,
            instructor: l.instructor,
            avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null,
          };
        }),
      }));

      const name = studentName || "Student";
      return NextResponse.json({
        type: "student-lessons",
        data: {
          studentName: name,
          studentUserId: suid,
          courses,
          totalLessons: lessons.length,
        },
        summary: `${lessons.length} lessons for ${name} across ${courses.length} course${courses.length !== 1 ? "s" : ""}`,
      });
    }

    // lesson-briefing-{current|next}-{en|nl}
    if (action.startsWith("lesson-briefing-")) {
      if (!capabilities.includes("instructor-schedule")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (!bookingId) {
        return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
      }

      // Parse action: lesson-briefing-{current|previous}-{en|nl}
      const parts = action.split("-");
      const lessonChoice = parts[2] as "current" | "previous";
      const lang = parts[3] as "en" | "nl";
      if (!["current", "previous"].includes(lessonChoice) || !["en", "nl"].includes(lang)) {
        return NextResponse.json({ error: "Invalid lesson-briefing action format" }, { status: 400 });
      }

      // 1. Get booking detail
      const raw = await getBookingDetail(bookingId);
      if (!raw) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }

      const lesson = raw.lessons[0];
      if (!lesson?.plan?.id || !lesson.plan.course?.id) {
        return NextResponse.json({ error: "No lesson plan found for this booking" }, { status: 400 });
      }

      const courseId = lesson.plan.course.id;
      const courseName = lesson.plan.course.name;
      const studentUser = raw.user || raw.customer;
      const studentName = studentUser?.name || raw.eventTitle || "Student";

      // 2. Determine target exercise (current or previous)
      const coursePlans = await getCourseLessonPlans(courseId);
      const currentIdx = coursePlans.findIndex((p) => p.id === lesson.plan!.id);
      let targetPlan = coursePlans[currentIdx] || null;
      let isPreviousLesson = false;

      if (lessonChoice === "previous" && currentIdx > 0) {
        targetPlan = coursePlans[currentIdx - 1];
        isPreviousLesson = true;
      }

      if (!targetPlan) {
        return NextResponse.json({ error: "Could not determine target exercise" }, { status: 400 });
      }

      // 3. Fetch student context (recent lessons) in parallel with RAG query
      const exerciseQuery = `${targetPlan.name} ${courseName} flight training exercise briefing`;
      const userRoles = roleOverride?.length ? roleOverride : ["instructor"];
      const allowedFolders = await getFoldersForRoles(userRoles);

      const [studentHistory, ragResults] = await Promise.all([
        studentUser?.id ? getStudentLessonHistory(studentUser.id, 5) : Promise.resolve([]),
        queryDocuments(exerciseQuery, allowedFolders, 8),
      ]);

      // 4. Build student context string
      let studentContext: string | null = null;
      if (studentHistory.length > 0) {
        const lines = studentHistory.map((l) => {
          const scores = l.records.filter((r) => r.score !== null);
          const avgScore = scores.length > 0
            ? (scores.reduce((sum, r) => sum + r.score!, 0) / scores.length).toFixed(1)
            : "—";
          return `${l.date} | ${l.planName || "—"} | ${l.status || "?"} | avg: ${avgScore} | ${l.comments?.replace(/\n/g, "; ").slice(0, 100) || ""}`;
        });
        studentContext = `Recent lessons for ${studentName}:\n${lines.join("\n")}`;
      }

      // 5. Build RAG context
      const ragContext = ragResults.length > 0
        ? ragResults.map((r) => `[${r.fileName}] ${r.text}`).join("\n\n")
        : null;

      // 6. Build Gemini prompt
      const langLabel = lang === "nl" ? "Dutch" : "English";
      const systemPrompt = `You are an experienced flight instructor preparing a structured lesson briefing.
Generate a clear, practical briefing for the exercise "${targetPlan.name}" (exercise #${targetPlan.sequence}) in the course "${courseName}".

Output language: ${langLabel}

The briefing must be structured in sections. Return ONLY valid JSON with this format:
{
  "sections": [
    { "title": "section title", "content": "section content with markdown formatting" }
  ]
}

Sections to include (in ${langLabel}):
${lang === "nl" ? `
1. "Doel" — Wat gaat de student leren? Kernleerdoelen.
2. "Voorbereiding" — Wat moet de student voorbereiden of weten?
3. "Briefing" — Hoofdpunten van de briefing, procedures, technieken.
4. "Aandachtspunten" — Veelgemaakte fouten, waar op te letten.
5. "Oefening" — Hoe de vlucht wordt opgebouwd, oefenvolgorde.
` : `
1. "Objective" — What will the student learn? Key learning objectives.
2. "Preparation" — What should the student prepare or know beforehand?
3. "Briefing" — Main briefing points, procedures, techniques.
4. "Watch Points" — Common mistakes, things to pay attention to.
5. "Exercise" — How the flight is structured, exercise sequence.
`}

${targetPlan.description ? `Wings exercise description:\n${targetPlan.description}\n` : ""}
${targetPlan.prep ? `Wings preparation notes:\n${targetPlan.prep}\n` : ""}
${targetPlan.briefing ? `Wings briefing notes:\n${targetPlan.briefing}\n` : ""}
${studentContext ? `\nStudent context:\n${studentContext}\n` : ""}
${ragContext ? `\nReference materials:\n${ragContext}\n` : ""}

Keep each section concise and practical. Use bullet points where appropriate. Focus on what the instructor needs to cover.`;

      // 7. Call Gemini
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      });

      const result = await model.generateContent(systemPrompt);
      const responseText = result.response.text();

      let sections: { title: string; content: string }[] = [];
      try {
        const parsed = JSON.parse(responseText);
        sections = parsed.sections || [];
      } catch {
        // If JSON parsing fails, wrap the raw response as a single section
        sections = [{ title: lang === "nl" ? "Briefing" : "Briefing", content: responseText }];
      }

      const briefingData = {
        lessonName: targetPlan.name,
        courseName,
        studentName,
        exerciseNumber: targetPlan.sequence,
        isNextLesson: false,
        isPreviousLesson,
        lang,
        wingsPrep: targetPlan.prep,
        wingsBriefing: targetPlan.briefing,
        wingsDescription: targetPlan.description,
        sections,
        studentContext,
      };

      const lessonLabel = isPreviousLesson
        ? (lang === "nl" ? "Vorige les" : "Previous lesson")
        : (lang === "nl" ? "Deze les" : "This lesson");

      return NextResponse.json({
        type: "lesson-briefing",
        data: briefingData,
        summary: `${lessonLabel}: ${targetPlan.name} — ${studentName}`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("Capability action error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
