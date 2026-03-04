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

// --- Public API ---

/**
 * Fetch all documents for a Wings user by their user ID
 */
export async function getUserDocuments(wingsUserId: number): Promise<WingsUserDocuments | null> {
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
    if (!user) return null;

    return {
      userId: user.id,
      userName: user.name,
      documents: user.documents,
    };
  } catch (err) {
    console.error("Wings: failed to fetch user documents:", err);
    return null;
  }
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
