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

/**
 * Fetch user roles from Airtable by email address
 */
export async function getUserRoles(email: string): Promise<string[]> {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured, returning empty roles");
    return [];
  }

  try {
    // Use filterByFormula to find the customer by email (case-insensitive)
    const formula = `LOWER({Client E-Mail}) = LOWER("${email.replace(/"/g, '\\"')}")`;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}&fields%5B%5D=Wings%20Role&fields%5B%5D=Client%20E-Mail`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      // Cache for 5 minutes
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Airtable API error:", error);
      return [];
    }

    const data: AirtableResponse = await response.json();

    if (data.records.length === 0) {
      console.log(`No Airtable record found for email: ${email}`);
      return [];
    }

    const roles = data.records[0].fields["Wings Role"] || [];
    console.log(`Found roles for ${email}:`, roles);
    return roles;
  } catch (error) {
    console.error("Failed to fetch roles from Airtable:", error);
    return [];
  }
}
