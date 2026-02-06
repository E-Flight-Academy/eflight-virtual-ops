import { Client } from "@notionhq/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getKvFlows,
  setKvFlows,
  type FlowOption,
  type KvFlowStep,
  type KvFlowsData,
} from "./kv-cache";

// L1: in-memory cache
let cachedFlows: KvFlowsData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchFlowsFromNotion(): Promise<KvFlowStep[]> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_FLOWS_DATABASE_ID;

  if (!apiKey || !databaseId) {
    throw new Error("NOTION_API_KEY or NOTION_FLOWS_DATABASE_ID is not configured");
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

  const steps: KvFlowStep[] = [];

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    const props = page.properties;
    let name = "";
    let message = "";
    let endAction: "Continue Flow" | "Start AI Chat" = "Continue Flow";
    let contextKey = "";
    let endPrompt = "";
    let order = 0;
    let relationIds: string[] = [];
    let relatedFaqId: string | null = null;

    for (const [key, value] of Object.entries(props)) {
      if (value.type === "title" && value.title.length > 0) {
        name = value.title
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
      if (
        key === "Message" &&
        value.type === "rich_text" &&
        value.rich_text.length > 0
      ) {
        message = value.rich_text
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
      if (key === "Next Dialog Flow" && value.type === "relation") {
        relationIds = (value.relation as { id: string }[]).map((r) => r.id);
      }
      if (key === "End Action" && value.type === "select" && value.select) {
        const val = value.select.name;
        if (val === "Start AI Chat" || val === "Continue Flow") {
          endAction = val;
        }
      }
      if (
        key === "Context Key" &&
        value.type === "rich_text" &&
        value.rich_text.length > 0
      ) {
        contextKey = value.rich_text
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
      if (
        key === "End Prompt" &&
        value.type === "rich_text" &&
        value.rich_text.length > 0
      ) {
        endPrompt = value.rich_text
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
      if (key === "Order" && value.type === "number") {
        order = value.number ?? 0;
      }
      if (key === "Related FAQ" && value.type === "relation") {
        const rels = value.relation as { id: string }[];
        if (rels.length > 0) {
          relatedFaqId = rels[0].id;
        }
      }
    }

    // Fetch Related FAQ question and answer if linked
    let relatedFaqQuestion = "";
    let relatedFaqQuestionNl = "";
    let relatedFaqQuestionDe = "";
    let relatedFaqAnswer = "";
    let relatedFaqAnswerNl = "";
    let relatedFaqAnswerDe = "";
    let relatedFaqUrl = "";
    if (relatedFaqId) {
      try {
        const faqPage = await notion.pages.retrieve({ page_id: relatedFaqId });
        if ("properties" in faqPage) {
          const faqProps = faqPage.properties as Record<string, unknown>;
          // Extract text from rich_text property
          const getText = (propName: string): string => {
            const prop = faqProps[propName] as { type: string; rich_text: { plain_text: string }[] } | undefined;
            if (prop?.type === "rich_text" && prop.rich_text.length > 0) {
              return prop.rich_text.map((t) => t.plain_text).join("");
            }
            return "";
          };
          // Extract title (Question)
          const getTitle = (): string => {
            for (const val of Object.values(faqProps)) {
              const v = val as { type: string; title: { plain_text: string }[] };
              if (v.type === "title" && v.title.length > 0) {
                return v.title.map((t) => t.plain_text).join("");
              }
            }
            return "";
          };
          // Extract URL
          const getUrl = (): string => {
            const urlProp = faqProps["URL"] as { type: string; url?: string | null } | undefined;
            return urlProp?.type === "url" && urlProp.url ? urlProp.url : "";
          };
          relatedFaqQuestion = getTitle();
          relatedFaqQuestionNl = getText("Question (NL)");
          relatedFaqQuestionDe = getText("Question (DE)");
          relatedFaqAnswer = getText("Answer (EN)");
          relatedFaqAnswerNl = getText("Answer (NL)");
          relatedFaqAnswerDe = getText("Answer (DE)");
          relatedFaqUrl = getUrl();
        }
      } catch (err) {
        console.warn(`Failed to fetch Related FAQ ${relatedFaqId}:`, err);
      }
    }

    // Resolve related pages for Next Dialog Flow
    const nextDialogFlow: FlowOption[] = [];
    for (const pageId of relationIds) {
      try {
        const relatedPage = await notion.pages.retrieve({ page_id: pageId });
        if (!("properties" in relatedPage)) continue;

        // Extract name from the title property (used for navigation)
        let relName = "";
        let relLabel = "";
        for (const [key, val] of Object.entries(relatedPage.properties)) {
          if (val.type === "title" && val.title.length > 0) {
            relName = val.title
              .map((t: { plain_text: string }) => t.plain_text)
              .join("");
          }
          if (
            key === "Label" &&
            val.type === "rich_text" &&
            val.rich_text.length > 0
          ) {
            relLabel = val.rich_text
              .map((t: { plain_text: string }) => t.plain_text)
              .join("");
          }
        }
        // Use Label for display, fall back to title
        const displayLabel = relLabel || relName;

        // Extract icon (emoji or image URL)
        let icon: string | null = null;
        const pageIcon = (relatedPage as { icon?: { type: string; emoji?: string; external?: { url: string }; file?: { url: string } } }).icon;
        if (pageIcon?.type === "emoji" && pageIcon.emoji) {
          icon = pageIcon.emoji;
        } else if (pageIcon?.type === "external" && pageIcon.external?.url) {
          icon = pageIcon.external.url;
        } else if (pageIcon?.type === "file" && pageIcon.file?.url) {
          icon = pageIcon.file.url;
        }

        if (relName && displayLabel) {
          nextDialogFlow.push({ name: relName, label: displayLabel, labelNl: "", labelDe: "", icon });
        }
      } catch (err) {
        console.warn(`Failed to fetch related flow page ${pageId}:`, err);
      }
    }

    if (name && (message || endAction === "Start AI Chat")) {
      steps.push({ name, message, messageNl: "", messageDe: "", nextDialogFlow, endAction, contextKey, endPrompt, endPromptNl: "", endPromptDe: "", relatedFaqQuestion, relatedFaqQuestionNl, relatedFaqQuestionDe, relatedFaqAnswer, relatedFaqAnswerNl, relatedFaqAnswerDe, relatedFaqUrl, order });
    }
  }

  // Auto-translate flow strings via Gemini
  await translateFlowSteps(steps);

  return steps;
}

async function translateFlowStrings(
  strings: string[],
  targetLang: string
): Promise<string[]> {
  if (strings.length === 0) return [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return strings.map(() => "");

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const numbered = strings.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const prompt = `Translate each numbered line below to ${targetLang}. Return ONLY the translations, one per line, in the same numbered format (e.g. "1. translation"). Keep the same numbering. Do not add explanations.\n\n${numbered}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse numbered lines back
    const lines = text.split("\n").filter((l) => l.trim());
    const translations: string[] = new Array(strings.length).fill("");
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        const idx = parseInt(match[1], 10) - 1;
        if (idx >= 0 && idx < strings.length) {
          translations[idx] = match[2].trim();
        }
      }
    }
    return translations;
  } catch (err) {
    console.warn(`Flow translation to ${targetLang} failed:`, err);
    return strings.map(() => "");
  }
}

async function translateFlowSteps(steps: KvFlowStep[]): Promise<void> {
  // Collect all strings to translate with their source mapping
  const entries: { text: string; stepIdx: number; field: string; optionIdx?: number }[] = [];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.message) entries.push({ text: s.message, stepIdx: i, field: "message" });
    if (s.endPrompt) entries.push({ text: s.endPrompt, stepIdx: i, field: "endPrompt" });
    for (let j = 0; j < s.nextDialogFlow.length; j++) {
      const o = s.nextDialogFlow[j];
      if (o.label) entries.push({ text: o.label, stepIdx: i, field: "label", optionIdx: j });
    }
  }

  if (entries.length === 0) return;

  const strings = entries.map((e) => e.text);

  const [nlResults, deResults] = await Promise.all([
    translateFlowStrings(strings, "Dutch"),
    translateFlowStrings(strings, "German"),
  ]);

  // Map translations back
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const nl = nlResults[i] || "";
    const de = deResults[i] || "";

    if (e.field === "message") {
      steps[e.stepIdx].messageNl = nl;
      steps[e.stepIdx].messageDe = de;
    } else if (e.field === "endPrompt") {
      steps[e.stepIdx].endPromptNl = nl;
      steps[e.stepIdx].endPromptDe = de;
    } else if (e.field === "label" && e.optionIdx !== undefined) {
      steps[e.stepIdx].nextDialogFlow[e.optionIdx].labelNl = nl;
      steps[e.stepIdx].nextDialogFlow[e.optionIdx].labelDe = de;
    }
  }

  console.log(`Translated ${entries.length} flow strings to NL and DE`);
}

export async function syncFlows(): Promise<KvFlowStep[]> {
  const steps = await fetchFlowsFromNotion();
  const data: KvFlowsData = { steps, cachedAt: Date.now() };
  cachedFlows = data;
  cacheTimestamp = Date.now();
  await setKvFlows(data);
  return steps;
}

export async function getFlows(): Promise<KvFlowStep[]> {
  // L1: in-memory
  if (cachedFlows && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFlows.steps;
  }

  // L2: Redis
  try {
    const kvFlows = await getKvFlows();
    if (kvFlows && Date.now() - kvFlows.cachedAt < CACHE_TTL_MS) {
      cachedFlows = kvFlows;
      cacheTimestamp = kvFlows.cachedAt;
      return kvFlows.steps;
    }
  } catch {
    // Fall through
  }

  // L3: Fetch from Notion
  return syncFlows();
}
