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

export interface WingsBooking {
  id: number;
  from: string;
  to: string;
  comments: string | null;
  eventTitle: string | null;
  type: { name: string };
  status: { name: string };
  customer: { id: number; name: string } | null;
  instructor: { id: number; name: string } | null;
  aircraft: { callSign: string } | null;
}

export interface WingsSchedule {
  userId: number;
  bookings: WingsBooking[];
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
      customer { id name }
      instructor { id name }
      aircraft { callSign }
    }
  }
}
`;

// --- Caches (per user, 1 hour TTL) ---

const docCache = new Map<number, { data: WingsUserDocuments | null; cachedAt: number }>();
const scheduleCache = new Map<number, { data: WingsSchedule | null; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// --- Public API ---

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
 * Build a context string for Gemini with instructor schedule info, grouped by date
 */
export function buildScheduleContext(schedule: WingsSchedule): string {
  if (schedule.bookings.length === 0) return "";

  // Group bookings by date
  const byDate = new Map<string, WingsBooking[]>();
  for (const b of schedule.bookings) {
    const date = b.from.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(b);
  }

  const lines: string[] = ["=== Instructor Schedule (upcoming 14 days) ==="];

  for (const [date, bookings] of byDate) {
    const wingsLink = `https://eflight.oywings.com/bookings?date=${date}`;
    lines.push(`\n${date} (${wingsLink}):`);
    for (const b of bookings) {
      const timeFrom = b.from.slice(11, 16);
      const timeTo = b.to.slice(11, 16);
      const student = b.eventTitle || b.customer?.name || "—";
      const aircraft = b.aircraft?.callSign || "—";
      const type = b.type.name;
      const status = b.status.name;
      const comments = b.comments ? ` | Notes: ${b.comments.replace(/\n/g, "; ")}` : "";
      lines.push(`  - ${timeFrom}–${timeTo} | ${type} | ${student} | Aircraft: ${aircraft} | Status: ${status}${comments}`);
    }
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
