import { Client } from "@notionhq/client";
import {
  getKvFaqs,
  setKvFaqs,
  type KvFaq,
  type KvFaqsData,
} from "./kv-cache";

// L1: in-memory cache
let cachedFaqs: KvFaqsData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchFaqsFromNotion(): Promise<KvFaq[]> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    throw new Error("NOTION_API_KEY or NOTION_DATABASE_ID is not configured");
  }

  const notion = new Client({ auth: apiKey });

  // Fetch ALL Live FAQs (not just starters)
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Live",
      checkbox: { equals: true },
    },
    sorts: [{ property: "Order", direction: "ascending" }],
  });

  const faqs: KvFaq[] = [];

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    const props = page.properties;
    let question = "";
    let answer = "";

    for (const [key, value] of Object.entries(props)) {
      if (value.type === "title" && value.title.length > 0) {
        question = value.title
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
      if (
        key === "Answer" &&
        value.type === "rich_text" &&
        value.rich_text.length > 0
      ) {
        answer = value.rich_text
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
    }

    if (question && answer) {
      faqs.push({ question, answer });
    }
  }

  return faqs;
}

export async function syncFaqs(): Promise<KvFaq[]> {
  const faqs = await fetchFaqsFromNotion();
  const data: KvFaqsData = { faqs, cachedAt: Date.now() };
  cachedFaqs = data;
  cacheTimestamp = Date.now();
  await setKvFaqs(data);
  return faqs;
}

export async function getFaqs(): Promise<KvFaq[]> {
  // L1: in-memory
  if (cachedFaqs && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFaqs.faqs;
  }

  // L2: Redis
  try {
    const kvFaqs = await getKvFaqs();
    if (kvFaqs && Date.now() - kvFaqs.cachedAt < CACHE_TTL_MS) {
      cachedFaqs = kvFaqs;
      cacheTimestamp = kvFaqs.cachedAt;
      return kvFaqs.faqs;
    }
  } catch {
    // Fall through
  }

  // L3: Fetch from Notion
  return syncFaqs();
}

export function buildFaqContext(faqs: KvFaq[]): string {
  if (faqs.length === 0) return "";
  const entries = faqs
    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
    .join("\n\n");
  return `=== Frequently Asked Questions ===\n${entries}`;
}
