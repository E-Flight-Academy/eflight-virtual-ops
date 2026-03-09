// Wings API client (OY Wings — Flight Training Management)

const BASE_URL = "https://api.oywings.com";
const GRAPHQL_URL = `${BASE_URL}/graphql`;
const SCHOOL_ID = "179";
const CLIENT_ID = "5";
const CLIENT_SECRET = process.env.WINGS_CLIENT_SECRET || "";
const USERNAME = process.env.WINGS_USERNAME || "";
const PASSWORD = process.env.WINGS_PASSWORD || "";

// --- Auth ---

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // refresh every 50 min (tokens last ~60 min)

async function authenticate(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!CLIENT_SECRET || !USERNAME || !PASSWORD) {
    throw new Error("Wings API credentials not configured (WINGS_CLIENT_SECRET, WINGS_USERNAME, WINGS_PASSWORD)");
  }

  const response = await fetch(`${BASE_URL}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-School-Id": SCHOOL_ID,
    },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: USERNAME,
      password: PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Wings auth failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  console.log("Wings: authenticated");
  return cachedToken!;
}

// --- GraphQL ---

async function gql<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await authenticate();

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "X-School-Id": SCHOOL_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Wings GraphQL error: ${response.status}`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`Wings GraphQL: ${body.errors[0].message}`);
  }

  return body.data as T;
}

// --- Types ---

export interface WingsDocument {
  id: number;
  description: string | null;
  expires: string | null;
  isExpired: boolean;
  type: { name: string };
  category: { name: string };
  file: { originalFilename: string; mimeType: string };
}

export interface WingsUserDocuments {
  userId: number;
  userName: string;
  documents: WingsDocument[];
}

export interface WingsLessonPlan {
  name: string;
  isAssessment: boolean;
}

export interface WingsLesson {
  id: number;
  plan: WingsLessonPlan | null;
  status: { name: string } | null;
}

export interface WingsBooking {
  id: number;
  from: string;
  to: string;
  comments: string | null;
  eventTitle: string | null;
  type: { name: string };
  status: { name: string };
  user: { id: number; name: string } | null;
  customer: { id: number; name: string } | null;
  instructor: { id: number; name: string } | null;
  aircraft: { callSign: string } | null;
  lessons: WingsLesson[];
}

export interface WingsSchedule {
  userId: number;
  bookings: WingsBooking[];
}

export interface WingsAircraftRemark {
  id: number;
  remark: string | null;
  details: string | null;
  phase: string | null;
  createdAt: string;
  releasedAt: string | null;
}

export interface WingsAircraftStatus {
  callSign: string;
  serviceable: boolean;
  documents: WingsDocument[];
  remarks: WingsAircraftRemark[];
}

// --- Queries ---

const USER_DOCUMENTS_QUERY = `
query GetUserDocuments($userId: Int!) {
  users(first: 1, filter: { id: $userId }) {
    data {
      id
      name
      documents {
        id
        description
        expires
        isExpired
        type { name }
        category { name }
        file { originalFilename mimeType }
      }
    }
  }
}
`;

const INSTRUCTOR_BOOKINGS_QUERY = `
query GetInstructorBookings($userId: Int!, $startDate: String!, $endDate: String!) {
  bookings(first: 50, filter: { userId: $userId, startDate: $startDate, endDate: $endDate }) {
    data {
      id
      from
      to
      comments
      eventTitle
      type { name }
      status { name }
      user { id name }
      customer { id name }
      instructor { id name }
      aircraft { callSign }
      lessons { id plan { name isAssessment } status { name } }
    }
  }
}
`;

const BOOKING_DETAIL_QUERY = `
query GetBookingDetail($bookingId: Int!) {
  bookings(first: 1, filter: { id: $bookingId }) {
    data {
      id
      from
      to
      eventTitle
      comments
      type { name }
      status { name }
      user { id name email }
      customer { id name email }
      instructor { id name }
      aircraft { callSign }
      lessons {
        id
        comments
        plan { id name isAssessment description prep briefing course { id name } }
        status { name }
        flights {
          id
          depart { name icaoName }
          arrive { name icaoName }
          offBlock
          onBlock
          airborne
          touchdown
          comments
        }
        records {
          id
          score
          comments
          objective { summary category { name } }
        }
      }
      report { id remarks landings fuelLtrs }
    }
  }
}
`;

export interface WingsBookingDetail {
  id: number;
  from: string;
  to: string;
  eventTitle: string | null;
  comments: string | null;
  type: { name: string };
  status: { name: string };
  user: { id: number; name: string; email: string | null } | null;
  customer: { id: number; name: string; email: string | null } | null;
  instructor: { id: number; name: string } | null;
  aircraft: { callSign: string } | null;
  lessons: {
    id: number;
    comments: string | null;
    plan: { id: number; name: string; isAssessment: boolean; description: string | null; prep: string | null; briefing: string | null; course: { id: number; name: string } | null } | null;
    status: { name: string } | null;
    flights: {
      id: number;
      depart: { name: string; icaoName: string } | null;
      arrive: { name: string; icaoName: string } | null;
      offBlock: string | null;
      onBlock: string | null;
      airborne: string | null;
      touchdown: string | null;
      comments: string | null;
    }[];
    records: {
      id: number;
      score: number | null;
      comments: string | null;
      objective: { summary: string; category: { name: string } | null } | null;
    }[];
  }[];
  report: { id: number; remarks: string | null; landings: number | null; fuelLtrs: number | null } | null;
}

/**
 * Fetch full details for a single booking by ID.
 */
export async function getBookingDetail(bookingId: number): Promise<WingsBookingDetail | null> {
  try {
    interface QueryResult {
      bookings: { data: WingsBookingDetail[] };
    }
    const data = await gql<QueryResult>(BOOKING_DETAIL_QUERY, { bookingId });
    return data.bookings.data[0] || null;
  } catch (err) {
    console.error("Wings: failed to fetch booking detail:", err);
    return null;
  }
}

/**
 * Find the most recent booking with a lesson plan for a given student, before a given date.
 */
const PREVIOUS_LESSON_QUERY = `
query GetPreviousLesson($userId: Int!, $startDate: String!, $endDate: String!) {
  bookings(first: 50, filter: { userId: $userId, startDate: $startDate, endDate: $endDate }) {
    data {
      id
      from
      to
      comments
      eventTitle
      type { name }
      status { name }
      user { id name }
      customer { id name }
      instructor { id name }
      aircraft { callSign }
      lessons {
        id
        comments
        plan { name isAssessment course { name } }
        status { name }
        records {
          id
          score
          comments
          objective { summary category { name } }
        }
      }
    }
  }
}
`;

export interface PreviousLessonResult {
  bookingId: number;
  date: string;
  planName: string;
  isAssessment: boolean;
  status: string | null;
  comments: string | null;
  records: { objectiveSummary: string; categoryName: string; score: number | null; comments: string | null }[];
}

export async function getPreviousLessonBooking(
  studentUserId: number,
  beforeDate: string,
): Promise<PreviousLessonResult | null> {
  try {
    const endDate = beforeDate;
    const startDate = new Date(new Date(beforeDate + "T00:00:00").getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    interface PrevBooking extends WingsBooking {
      lessons: {
        id: number;
        comments: string | null;
        plan: { name: string; isAssessment: boolean; course: { name: string } | null } | null;
        status: { name: string } | null;
        records: {
          id: number;
          score: number | null;
          comments: string | null;
          objective: { summary: string; category: { name: string } | null } | null;
        }[];
      }[];
    }
    interface QueryResult {
      bookings: { data: PrevBooking[] };
    }

    const data = await gql<QueryResult>(PREVIOUS_LESSON_QUERY, {
      userId: studentUserId,
      startDate,
      endDate,
    });

    // Find most recent booking with a lesson, sorted newest first
    const sorted = data.bookings.data
      .filter((b) => b.lessons?.length > 0)
      .sort((a, b) => b.from.localeCompare(a.from));

    if (sorted.length === 0) return null;

    const booking = sorted[0];
    // Prefer a lesson with a plan, fall back to the first lesson
    const lesson = booking.lessons.find((l) => l.plan?.name) || booking.lessons[0];
    return {
      bookingId: booking.id,
      date: booking.from.slice(0, 10),
      planName: lesson.plan?.name || "—",
      isAssessment: lesson.plan?.isAssessment || false,
      status: lesson.status?.name || null,
      comments: lesson.comments || null,
      records: (lesson.records || []).map((r) => ({
        objectiveSummary: r.objective?.summary || "—",
        categoryName: r.objective?.category?.name || "—",
        score: r.score,
        comments: r.comments || null,
      })),
    };
  } catch (err) {
    console.error("Wings: failed to fetch previous lesson:", err);
    return null;
  }
}

export interface StudentLessonSummary {
  bookingId: number;
  date: string;
  courseName: string | null;
  planName: string | null;
  isAssessment: boolean;
  status: string | null;
  instructor: string | null;
  aircraft: string | null;
  comments: string | null;
  records: { objectiveSummary: string; categoryName: string; score: number | null; comments: string | null }[];
}

/**
 * Fetch the last N lessons for a student (most recent first).
 */
export async function getStudentLessonHistory(
  studentUserId: number,
  count?: number,
): Promise<StudentLessonSummary[]> {
  try {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 6 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    interface HistBooking extends WingsBooking {
      lessons: {
        id: number;
        comments: string | null;
        plan: { name: string; isAssessment: boolean; course: { name: string } | null } | null;
        status: { name: string } | null;
        records: {
          id: number;
          score: number | null;
          comments: string | null;
          objective: { summary: string; category: { name: string } | null } | null;
        }[];
      }[];
    }
    interface QueryResult {
      bookings: { data: HistBooking[] };
    }

    // Paginate through all results (Wings returns max per page)
    const allBookings: HistBooking[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const query = PREVIOUS_LESSON_QUERY.replace("first: 50", `first: ${perPage}, page: ${page}`);
      const data = await gql<QueryResult>(query, {
        userId: studentUserId,
        startDate,
        endDate,
      });
      allBookings.push(...data.bookings.data);
      if (data.bookings.data.length < perPage) break;
      page++;
      if (page > 10) break; // safety limit
    }

    // Filter to confirmed bookings with lessons, sort newest first
    let withLessons = allBookings
      .filter((b) => b.status.name !== "Declined" && b.lessons.length > 0)
      .sort((a, b) => b.from.localeCompare(a.from));

    if (count) withLessons = withLessons.slice(0, count);

    return withLessons.map((b) => {
      const lesson = b.lessons.find((l) => l.plan?.name) || b.lessons[0];
      return {
        bookingId: b.id,
        date: b.from.slice(0, 10),
        courseName: lesson.plan?.course?.name || null,
        planName: lesson.plan?.name || null,
        isAssessment: lesson.plan?.isAssessment || false,
        status: lesson.status?.name || null,
        instructor: b.instructor?.name || null,
        aircraft: b.aircraft?.callSign || null,
        comments: lesson.comments || null,
        records: (lesson.records || []).map((r) => ({
          objectiveSummary: r.objective?.summary || "—",
          categoryName: r.objective?.category?.name || "—",
          score: r.score,
          comments: r.comments || null,
        })),
      };
    });
  } catch (err) {
    console.error("Wings: failed to fetch student lesson history:", err);
    return [];
  }
}

// --- Course Lesson Plans ---

export interface WingsLessonPlanFull {
  id: number;
  sequence: number;
  name: string;
  isAssessment: boolean;
  description: string | null;
  prep: string | null;
  briefing: string | null;
}

const COURSE_LESSON_PLANS_QUERY = `
query GetCourseLessonPlans($courseId: Int!) {
  lessonPlans(first: 100, filter: { course: $courseId }) {
    data {
      id sequence name isAssessment
      description prep briefing
    }
  }
}
`;

const coursePlansCache = new Map<number, { data: WingsLessonPlanFull[]; cachedAt: number }>();

/**
 * Fetch all lesson plans (exercises) for a course, sorted by sequence.
 * Cached for 1 hour since course content rarely changes.
 */
export async function getCourseLessonPlans(courseId: number): Promise<WingsLessonPlanFull[]> {
  const cached = coursePlansCache.get(courseId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    interface QueryResult {
      lessonPlans: { data: WingsLessonPlanFull[] };
    }
    const data = await gql<QueryResult>(COURSE_LESSON_PLANS_QUERY, { courseId });
    const plans = data.lessonPlans.data.sort((a, b) => a.sequence - b.sequence);
    coursePlansCache.set(courseId, { data: plans, cachedAt: Date.now() });
    return plans;
  } catch (err) {
    console.error("Wings: failed to fetch course lesson plans:", err);
    return [];
  }
}

const AIRCRAFT_STATUS_QUERY = `
query GetAllAircraft {
  aircraft(first: 20) {
    data {
      callSign
      serviceable
      documents {
        id
        description
        expires
        isExpired
        type { name }
        category { name }
        file { originalFilename mimeType }
      }
      remarks {
        id
        remark
        details
        phase
        createdAt
        releasedAt
      }
    }
  }
}
`;

// --- Caches (per user, 1 hour TTL) ---

const docCache = new Map<number, { data: WingsUserDocuments | null; cachedAt: number }>();
const scheduleCache = new Map<number, { data: WingsSchedule | null; cachedAt: number }>();
let aircraftCache: { data: WingsAircraftStatus[]; cachedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// --- Public API ---

/**
 * Fetch aircraft status by callSign (cached, all aircraft fetched at once)
 */
export async function getAircraftStatus(callSign: string): Promise<WingsAircraftStatus | null> {
  if (!aircraftCache || Date.now() - aircraftCache.cachedAt > CACHE_TTL_MS) {
    try {
      interface QueryResult {
        aircraft: {
          data: {
            callSign: string;
            serviceable: boolean;
            documents: WingsDocument[];
            remarks: WingsAircraftRemark[];
          }[];
        };
      }
      const data = await gql<QueryResult>(AIRCRAFT_STATUS_QUERY);
      aircraftCache = {
        data: data.aircraft.data.map((ac) => ({
          callSign: ac.callSign,
          serviceable: ac.serviceable,
          documents: ac.documents,
          remarks: ac.remarks,
        })),
        cachedAt: Date.now(),
      };
    } catch (err) {
      console.error("Wings: failed to fetch aircraft:", err);
      return null;
    }
  }

  return aircraftCache.data.find((ac) => ac.callSign === callSign) || null;
}

/**
 * Fetch all documents for a Wings user by their user ID (cached)
 */
export async function getUserDocuments(wingsUserId: number): Promise<WingsUserDocuments | null> {
  const cached = docCache.get(wingsUserId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    interface QueryResult {
      users: {
        data: {
          id: number;
          name: string;
          documents: WingsDocument[];
        }[];
      };
    }

    const data = await gql<QueryResult>(USER_DOCUMENTS_QUERY, { userId: wingsUserId });
    const user = data.users.data[0];
    const result = user ? { userId: user.id, userName: user.name, documents: user.documents } : null;

    docCache.set(wingsUserId, { data: result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.error("Wings: failed to fetch user documents:", err);
    return null;
  }
}

/**
 * Fetch upcoming bookings for an instructor (cached, 14-day window)
 */
export async function getInstructorBookings(wingsUserId: number): Promise<WingsSchedule | null> {
  const cached = scheduleCache.get(wingsUserId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const startDate = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    interface QueryResult {
      bookings: {
        data: WingsBooking[];
      };
    }

    const data = await gql<QueryResult>(INSTRUCTOR_BOOKINGS_QUERY, {
      userId: wingsUserId,
      startDate,
      endDate,
    });

    const result: WingsSchedule = {
      userId: wingsUserId,
      bookings: data.bookings.data,
    };

    scheduleCache.set(wingsUserId, { data: result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.error("Wings: failed to fetch instructor bookings:", err);
    return null;
  }
}

/**
 * Fetch bookings for an instructor with a wider window (past 7 + future 21 days).
 * Used by capability-action endpoint for the direct schedule view.
 */
export async function getInstructorBookingsExpanded(
  wingsUserId: number,
  pastDays = 7,
  futureDays = 21,
): Promise<WingsBooking[]> {
  const startDate = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + futureDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  interface QueryResult {
    bookings: { data: WingsBooking[] };
  }

  const data = await gql<QueryResult>(INSTRUCTOR_BOOKINGS_QUERY, {
    userId: wingsUserId,
    startDate,
    endDate,
  });

  return data.bookings.data;
}

/**
 * Build a context string for Gemini with instructor schedule info, grouped by date
 */
export function buildScheduleContext(schedule: WingsSchedule): string {
  if (schedule.bookings.length === 0) return "";

  // TOON-style tabular format for token efficiency
  const lines: string[] = [
    "=== Schedule ===",
    "date\ttime\ttype\tstudent\taircraft\tstatus\tnotes\twingsLink",
  ];

  for (const b of schedule.bookings) {
    const date = b.from.slice(0, 10);
    const time = `${b.from.slice(11, 16)}–${b.to.slice(11, 16)}`;
    const student = b.eventTitle || b.user?.name || b.customer?.name || "—";
    const aircraft = b.aircraft?.callSign || "—";
    const notes = b.comments?.replace(/\n/g, "; ") || "";
    const link = `https://eflight.oywings.com/bookings?date=${date}`;
    lines.push(`${date}\t${time}\t${b.type.name}\t${student}\t${aircraft}\t${b.status.name}\t${notes}\t${link}`);
  }

  return lines.join("\n");
}

/**
 * Get documents with validity dates, sorted by expiry (soonest first).
 * Expired documents appear first.
 */
export function getDocumentValidities(documents: WingsDocument[]): WingsDocument[] {
  return documents
    .filter((d) => d.expires)
    .sort((a, b) => {
      // Expired first, then by date ascending
      if (a.isExpired !== b.isExpired) return a.isExpired ? -1 : 1;
      return (a.expires || "").localeCompare(b.expires || "");
    });
}

/**
 * Build a context string for Gemini with document validity info
 */
export function buildDocumentValidityContext(docs: WingsDocument[], userName: string): string {
  const validities = getDocumentValidities(docs);
  if (validities.length === 0) return "";

  const lines = validities.map((d) => {
    const status = d.isExpired ? "EXPIRED" : "Valid";
    const date = d.expires?.slice(0, 10) || "unknown";
    return `- [${status}] ${d.type.name}: ${d.description || d.file.originalFilename} (expires: ${date})`;
  });

  return [
    `=== Document Validity for ${userName} ===`,
    ...lines,
  ].join("\n");
}
