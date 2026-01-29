import { Client } from "@notionhq/client";

export interface Starter {
  text: string;
  order: number;
}

// In-memory cache
let cachedStarters: Starter[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchStartersFromNotion(): Promise<Starter[]> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    throw new Error("NOTION_API_KEY or NOTION_DATABASE_ID is not configured");
  }

  const notion = new Client({ auth: apiKey });

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Show as Starter",
      checkbox: { equals: true },
    },
    sorts: [
      { property: "Order", direction: "ascending" },
    ],
  });

  const starters: Starter[] = [];

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    // Find the title property
    const props = page.properties;
    let text = "";
    let order = 0;

    for (const [, value] of Object.entries(props)) {
      if (value.type === "title" && value.title.length > 0) {
        text = value.title.map((t: { plain_text: string }) => t.plain_text).join("");
      }
      if (value.type === "number" && value.number !== null) {
        order = value.number;
      }
    }

    if (text) {
      starters.push({ text, order });
    }
  }

  return starters;
}

export async function syncStarters(): Promise<Starter[]> {
  const starters = await fetchStartersFromNotion();
  cachedStarters = starters;
  cacheTimestamp = Date.now();
  return starters;
}

export async function getStarters(): Promise<Starter[]> {
  if (cachedStarters && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedStarters;
  }

  return syncStarters();
}
