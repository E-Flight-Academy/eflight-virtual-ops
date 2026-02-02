import { Client } from "@notionhq/client";

export interface Starter {
  question: string;
  questionNl: string;
  questionDe: string;
  answer: string;
  answerNl: string;
  answerDe: string;
}

// In-memory cache
let cachedStarters: Starter[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getRichText(props: Record<string, unknown>, key: string): string {
  const prop = props[key] as { type: string; rich_text: { plain_text: string }[] } | undefined;
  if (prop?.type === "rich_text" && prop.rich_text.length > 0) {
    return prop.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

function getRichTextMd(props: Record<string, unknown>, key: string): string {
  const prop = props[key] as {
    type: string;
    rich_text: {
      plain_text: string;
      annotations: { bold: boolean; italic: boolean; strikethrough: boolean; code: boolean };
    }[];
  } | undefined;
  if (prop?.type !== "rich_text" || prop.rich_text.length === 0) return "";

  let md = prop.rich_text
    .map((t) => {
      let text = t.plain_text;
      if (t.annotations.code) text = `\`${text}\``;
      if (t.annotations.bold) text = `**${text}**`;
      if (t.annotations.italic) text = `*${text}*`;
      if (t.annotations.strikethrough) text = `~~${text}~~`;
      return text;
    })
    .join("");

  md = md.replace(/^• /gm, "- ");
  md = md.replace(/\n/g, "\n\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  return md;
}

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
      and: [
        { property: "Starter Prompt", checkbox: { equals: true } },
        { property: "Live", checkbox: { equals: true } },
      ],
    },
    sorts: [
      { property: "Order", direction: "ascending" },
    ],
  });

  const starters: Starter[] = [];

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    const props = page.properties as Record<string, unknown>;

    // Title property = Question (EN)
    let question = "";
    for (const value of Object.values(props)) {
      const v = value as { type: string; title: { plain_text: string }[] };
      if (v.type === "title" && v.title.length > 0) {
        question = v.title.map((t) => t.plain_text).join("");
        break;
      }
    }

    const questionNl = getRichText(props, "Question (NL)");
    const questionDe = getRichText(props, "Question (DE)");
    const answer = getRichTextMd(props, "Answer (EN)");
    const answerNl = getRichTextMd(props, "Answer (NL)");
    const answerDe = getRichTextMd(props, "Answer (DE)");

    if (question) {
      starters.push({ question, questionNl, questionDe, answer, answerNl, answerDe });
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
