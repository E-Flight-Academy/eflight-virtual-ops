import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getCapabilitiesForRoles } from "@/lib/role-access";
import { getInstructorBookingsExpanded, getBookingDetail, getUserDocuments, getDocumentValidities, getAircraftStatus, getPreviousLessonBooking, getStudentLessonHistory, type WingsBooking } from "@/lib/wings";
import { getKvWingsSchedule, setKvWingsSchedule, getKvStudentLessons, setKvStudentLessons } from "@/lib/kv-cache";
import type { ScheduleDay, ScheduleBooking, BookingDetail, BookingLesson, BookingFlight, UserDocuments, DocumentValidity, AircraftStatus, AircraftRemark, PreviousLesson, LessonRecord } from "@/types/chat";

const requestSchema = z.object({
  action: z.string().min(1).max(100),
  bookingId: z.number().int().positive().optional(),
  previousLessonBookingId: z.number().int().positive().optional(),
  studentUserId: z.number().int().positive().optional(),
  studentName: z.string().max(200).optional(),
  userEmail: z.string().email().max(200).optional(),
  roleOverride: z.array(z.string().max(50)).optional(),
});

const DEBUG_OVERRIDE_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com"];

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

      // Fetch documents for student/instructor and aircraft status in parallel
      const studentUser = raw.user || raw.customer;
      const docUserIds: { id: number; name: string }[] = [];
      if (studentUser?.id) docUserIds.push({ id: studentUser.id, name: studentUser.name });
      if (raw.instructor?.id) docUserIds.push({ id: raw.instructor.id, name: raw.instructor.name });

      const callSign = raw.aircraft?.callSign || null;
      const bookingDate = raw.from.slice(0, 10);
      const [docResults, acStatus, prevLesson] = await Promise.all([
        Promise.all(docUserIds.map((u) => getUserDocuments(u.id))),
        callSign ? getAircraftStatus(callSign) : Promise.resolve(null),
        studentUser?.id ? getPreviousLessonBooking(studentUser.id, bookingDate) : Promise.resolve(null),
      ]);

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
          return { name: d.type.name, expires: expiresStr, daysRemaining, isExpired: d.isExpired };
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
        studentUserId: studentUser?.id || null,
        studentEmail: studentUser?.email || null,
        instructor: raw.instructor?.name || "—",
        aircraft: raw.aircraft?.callSign || "—",
        comments: raw.comments,
        wingsLink: `https://eflight.oywings.com/bookings?date=${date}`,
        lessons: raw.lessons.map((l): BookingLesson => ({
          id: l.id,
          planName: l.plan?.name || null,
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
        previousLesson: prevLesson ? {
          bookingId: prevLesson.bookingId,
          date: prevLesson.date,
          planName: prevLesson.planName,
          isAssessment: prevLesson.isAssessment,
          status: prevLesson.status,
        } : null,
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

      // Build context string for Gemini
      const lines: string[] = [`=== Lesson History for ${studentName || "Student"} (last ${lessons.length} lessons) ===`];
      for (const l of lessons) {
        lines.push(`\n--- ${l.date} | ${l.planName || "No plan"} | ${l.status || "?"} | Instructor: ${l.instructor || "?"} | Aircraft: ${l.aircraft || "?"} ---`);
        if (l.comments) lines.push(`Comments: ${l.comments}`);
        if (l.records.length > 0) {
          lines.push("Scores:");
          for (const r of l.records) {
            if (r.score !== null) {
              lines.push(`  [${r.score}/5] ${r.objectiveSummary}${r.comments ? ` (${r.comments})` : ""}`);
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
      lines.push(`Date: ${raw.from.slice(0, 10)}`);
      lines.push(`Time: ${raw.from.slice(11, 16)}–${raw.to.slice(11, 16)}`);
      lines.push(`Type: ${raw.type.name}`);
      lines.push(`Status: ${raw.status.name}`);
      lines.push(`Instructor: ${raw.instructor?.name || "—"}`);
      lines.push(`Aircraft: ${raw.aircraft?.callSign || "—"}`);
      if (raw.comments) lines.push(`Booking comments: ${raw.comments}`);
      if (lesson) {
        if (lesson.plan?.name) lines.push(`Lesson plan: ${lesson.plan.name}${lesson.plan.isAssessment ? " (Assessment)" : ""}`);
        if (lesson.plan?.description) lines.push(`Description: ${lesson.plan.description}`);
        if (lesson.status?.name) lines.push(`Lesson status: ${lesson.status.name}`);
        if (lesson.comments) lines.push(`Instructor notes: ${lesson.comments}`);
        if (lesson.records && lesson.records.length > 0) {
          lines.push("Scores:");
          for (const r of lesson.records) {
            if (r.score !== null) {
              lines.push(`  [${r.score}/5] ${r.objective?.summary || "—"}${r.comments ? ` (${r.comments})` : ""}`);
            }
          }
        }
        if (lesson.flights && lesson.flights.length > 0) {
          for (const f of lesson.flights) {
            lines.push(`Flight: ${f.depart?.icaoName || f.depart?.name || "—"} → ${f.arrive?.icaoName || f.arrive?.name || "—"}`);
            if (f.comments) lines.push(`Flight comments: ${f.comments}`);
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
      const { studentUserId: suid, studentName } = parsed.data;
      if (!suid) {
        return NextResponse.json({ error: "studentUserId is required" }, { status: 400 });
      }

      // Try Redis cache first, otherwise fetch all lessons (3 year window)
      // Re-fetch if cached data has stale courseName (was booking.type.name, now lesson.plan.course.name)
      let lessons = await getKvStudentLessons(suid);
      const staleCache = lessons && lessons.length > 0 && (
        !lessons[0].courseName || lessons[0].courseName === "Lesson"
      );
      if (!lessons || staleCache) {
        lessons = await getStudentLessonHistory(suid);
        await setKvStudentLessons(suid, lessons);
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

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("Capability action error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
