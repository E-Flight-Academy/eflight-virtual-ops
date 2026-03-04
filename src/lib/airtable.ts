// Airtable integration for Wings roles

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || "";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
const AIRTABLE_TABLE_NAME = "Customers";

interface AirtableRecord {
  id: string;
  fields: {
    "Client E-Mail"?: string;
    "Wings Role"?: string[];
    Name?: string[];
    "Wings User ID"?: number;
  };
}

interface AirtableResponse {
  records: AirtableRecord[];
}

export interface AirtableUserData {
  roles: string[];
  wingsUserId: number | null;
}

/**
 * Fetch user data (roles + Wings User ID) from Airtable by email address
 */
export async function getUserData(email: string): Promise<AirtableUserData> {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured");
    return { roles: [], wingsUserId: null };
  }

  try {
    const formula = `LOWER({Client E-Mail}) = LOWER("${email.replace(/"/g, '\\"')}")`;
    const fields = ["Wings Role", "Client E-Mail", "Wings User ID"].map(f => `fields%5B%5D=${encodeURIComponent(f)}`).join("&");
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}&${fields}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Airtable API error:", error);
      return { roles: [], wingsUserId: null };
    }

    const data: AirtableResponse = await response.json();

    if (data.records.length === 0) {
      console.log(`No Airtable record found for email: ${email}`);
      return { roles: [], wingsUserId: null };
    }

    const record = data.records[0].fields;
    const roles = record["Wings Role"] || [];
    const wingsUserId = record["Wings User ID"] ?? null;
    console.log(`Found data for ${email}: roles=[${roles.join(", ")}], wingsUserId=${wingsUserId}`);
    return { roles, wingsUserId };
  } catch (error) {
    console.error("Failed to fetch data from Airtable:", error);
    return { roles: [], wingsUserId: null };
  }
}

/**
 * Fetch user roles from Airtable by email address
 */
export async function getUserRoles(email: string): Promise<string[]> {
  const data = await getUserData(email);
  return data.roles;
}
