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

function getRichText(props: Record<string, unknown>, key: string): string {
  const prop = props[key] as { type: string; rich_text: { plain_text: string }[] } | undefined;
  if (prop?.type === "rich_text" && prop.rich_text.length > 0) {
    return prop.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

export function getRichTextMd(props: Record<string, unknown>, key: string): string {
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

  // Convert bullet character to markdown list
  md = md.replace(/^• /gm, "- ");
  // Ensure single newlines render in markdown
  md = md.replace(/\n/g, "\n\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  return md;
}

export async function fetchFaqsFromNotion(): Promise<KvFaq[]> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    throw new Error("NOTION_API_KEY or NOTION_DATABASE_ID is not configured");
  }

  const notion = new Client({ auth: apiKey });

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

    // Category (select)
    const catProp = props["Category"] as { type: string; select?: { name: string } | null } | undefined;
    const category = catProp?.type === "select" && catProp.select?.name ? catProp.select.name : "";

    // Audience (multi_select)
    const audProp = props["Audience"] as { type: string; multi_select?: { name: string }[] } | undefined;
    const audience = audProp?.type === "multi_select" && audProp.multi_select
      ? audProp.multi_select.map((s) => s.name)
      : [];

    // Link (url property)
    const urlProp = props["Link"] as { type: string; url?: string | null } | undefined;
    const url = urlProp?.type === "url" && urlProp.url ? urlProp.url : "";

    // Include if at least one Q+A pair exists
    if (question && (answer || answerNl || answerDe)) {
      faqs.push({ question, questionNl, questionDe, answer, answerNl, answerDe, category, audience, url });
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

function getFaqQuestion(faq: KvFaq, lang: string): string {
  if (lang === "nl" && faq.questionNl) return faq.questionNl;
  if (lang === "de" && faq.questionDe) return faq.questionDe;
  return faq.question;
}

function getFaqAnswer(faq: KvFaq, lang: string): string {
  if (lang === "nl" && faq.answerNl) return faq.answerNl;
  if (lang === "de" && faq.answerDe) return faq.answerDe;
  return faq.answer;
}

export function buildFaqContext(faqs: KvFaq[], lang = "en"): string {
  if (faqs.length === 0) return "";
  const entries = faqs
    .filter((f) => getFaqAnswer(f, lang))
    .map((f) => {
      let entry = `Q: ${getFaqQuestion(f, lang)}\nA: ${getFaqAnswer(f, lang)}`;
      if (f.url) entry += `\nLink: ${f.url}`;
      return entry;
    })
    .join("\n\n");
  return `=== Frequently Asked Questions ===\n${entries}`;
}
