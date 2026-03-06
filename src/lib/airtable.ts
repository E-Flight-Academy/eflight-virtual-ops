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

    console.log(`[Airtable] Looking up email: ${email}, base: ${AIRTABLE_BASE_ID}, table: ${AIRTABLE_TABLE_NAME}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Airtable] API error:", response.status, error);
      return { roles: [], wingsUserId: null };
    }

    const data: AirtableResponse = await response.json();
    console.log(`[Airtable] Got ${data.records.length} records for ${email}`);

    if (data.records.length === 0) {
      console.log(`[Airtable] No record found for email: ${email}`);
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

export interface AirtableCustomerSummary {
  email: string;
  name: string;
  roles: string[];
}

/**
 * Search customers in Airtable by name or email (for admin user picker)
 */
export async function searchCustomers(query: string): Promise<AirtableCustomerSummary[]> {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    throw new Error(`Airtable not configured: token=${!!AIRTABLE_TOKEN}, base=${!!AIRTABLE_BASE_ID}`);
  }

  const q = query.replace(/"/g, '\\"');
  const formula = `OR(FIND(LOWER("${q}"), LOWER({Client E-Mail})), FIND(LOWER("${q}"), LOWER(ARRAYJOIN({Name}))))`;
  const fields = ["Client E-Mail", "Name", "Wings Role"].map(f => `fields%5B%5D=${encodeURIComponent(f)}`).join("&");
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=10&${fields}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Airtable ${response.status}: ${body}`);
  }

  const data = await response.json();
  const customers: AirtableCustomerSummary[] = [];

  for (const rec of data.records) {
    const email = rec.fields["Client E-Mail"];
    if (!email) continue;
    customers.push({
      email,
      name: rec.fields.Name?.[0] || email.split("@")[0],
      roles: rec.fields["Wings Role"] || [],
    });
  }

  return customers.sort((a, b) => a.name.localeCompare(b.name));
}
