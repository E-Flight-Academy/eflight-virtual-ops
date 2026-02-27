import { Client } from "@notionhq/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getKvFlows,
  setKvFlows,
  type FlowOption,
  type KvFlowStep,
  type KvFlowsData,
} from "./kv-cache";
import { getRichTextMd } from "./faq";

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

  // First pass: extract properties from each page (no API calls needed)
  const parsed = response.results
    .filter((page) => "properties" in page)
    .map((page) => {
      const pageId = (page as { id: string }).id;
      const props = (page as { properties: Record<string, unknown> }).properties;
      let name = "";
      let label = "";
      let message = "";
      let endAction: "Continue Flow" | "Start AI Chat" = "Continue Flow";
      let contextKey = "";
      let endPrompt = "";
      let order = 0;
      let nextStepNames: string[] = [];
      let relatedFaqId: string | null = null;
      let icon: string | null = null;

      // Extract page icon
      const pageIcon = (page as { icon?: { type: string; emoji?: string; external?: { url: string }; file?: { url: string } } }).icon;
      if (pageIcon?.type === "emoji" && pageIcon.emoji) {
        icon = pageIcon.emoji;
      } else if (pageIcon?.type === "external" && pageIcon.external?.url) {
        icon = pageIcon.external.url;
      } else if (pageIcon?.type === "file" && pageIcon.file?.url) {
        icon = pageIcon.file.url;
      }

      for (const [key, value] of Object.entries(props)) {
        const v = value as Record<string, unknown>;
        if (v.type === "title" && Array.isArray(v.title) && v.title.length > 0) {
          name = (v.title as { plain_text: string }[]).map((t) => t.plain_text).join("");
        }
        if (key === "Label" && v.type === "rich_text" && Array.isArray(v.rich_text) && v.rich_text.length > 0) {
          label = (v.rich_text as { plain_text: string }[]).map((t) => t.plain_text).join("");
        }
        if (key === "Message" && v.type === "rich_text" && Array.isArray(v.rich_text) && v.rich_text.length > 0) {
          message = getRichTextMd(props, "Message");
        }
        if (key === "Next Steps" && v.type === "rich_text" && Array.isArray(v.rich_text) && v.rich_text.length > 0) {
          const raw = (v.rich_text as { plain_text: string }[]).map((t) => t.plain_text).join("");
          nextStepNames = raw.split(",").map((s) => s.trim()).filter(Boolean);
        }
        if (key === "End Action" && v.type === "select" && v.select) {
          const val = (v.select as { name: string }).name;
          if (val === "Start AI Chat" || val === "Continue Flow") endAction = val;
        }
        if (key === "Context Key" && v.type === "rich_text" && Array.isArray(v.rich_text) && v.rich_text.length > 0) {
          contextKey = (v.rich_text as { plain_text: string }[]).map((t) => t.plain_text).join("");
        }
        if (key === "End Prompt" && v.type === "rich_text" && Array.isArray(v.rich_text) && v.rich_text.length > 0) {
          endPrompt = (v.rich_text as { plain_text: string }[]).map((t) => t.plain_text).join("");
        }
        if (key === "Order" && v.type === "number") {
          order = (v.number as number | null) ?? 0;
        }
        if (key === "Related FAQ" && v.type === "relation") {
          const rels = v.relation as { id: string }[];
          if (rels.length > 0) relatedFaqId = rels[0].id;
        }
      }

      return { pageId, name, label, icon, message, endAction, contextKey, endPrompt, order, nextStepNames, relatedFaqId };
    });

  // Collect FAQ page IDs to fetch in parallel
  const allFaqIds = new Set<string>();
  for (const p of parsed) {
    if (p.relatedFaqId) allFaqIds.add(p.relatedFaqId);
  }

  // Fetch FAQ pages in parallel
  const faqPages = await Promise.all(
    [...allFaqIds].map(async (pageId) => {
      try {
        const page = await notion.pages.retrieve({ page_id: pageId });
        return { pageId, page };
      } catch (err) {
        console.warn(`Failed to fetch Related FAQ ${pageId}:`, err);
        return null;
      }
    })
  );

  const faqPageMap = new Map<string, typeof faqPages[number]>();
  for (const entry of faqPages) {
    if (entry) faqPageMap.set(entry.pageId, entry);
  }

  // Build a lookup map of step name -> parsed data (for resolving Next Steps)
  const stepByName = new Map<string, typeof parsed[number]>();
  for (const p of parsed) {
    if (p.name) stepByName.set(p.name, p);
  }

  // Second pass: build flow steps
  for (const p of parsed) {
    // Resolve Related FAQ
    let relatedFaqQuestion = "";
    let relatedFaqQuestionNl = "";
    let relatedFaqQuestionDe = "";
    let relatedFaqAnswer = "";
    let relatedFaqAnswerNl = "";
    let relatedFaqAnswerDe = "";
    let relatedFaqUrl = "";

    if (p.relatedFaqId) {
      const faqEntry = faqPageMap.get(p.relatedFaqId);
      if (faqEntry && "properties" in faqEntry.page) {
        const faqProps = faqEntry.page.properties as Record<string, unknown>;
        const getText = (propName: string): string => {
          const prop = faqProps[propName] as { type: string; rich_text: { plain_text: string }[] } | undefined;
          if (prop?.type === "rich_text" && prop.rich_text.length > 0) {
            return prop.rich_text.map((t) => t.plain_text).join("");
          }
          return "";
        };
        const getTitle = (): string => {
          for (const val of Object.values(faqProps)) {
            const v = val as { type: string; title: { plain_text: string }[] };
            if (v.type === "title" && v.title.length > 0) {
              return v.title.map((t) => t.plain_text).join("");
            }
          }
          return "";
        };
        const getUrl = (): string => {
          const urlProp = faqProps["Link"] as { type: string; url?: string | null } | undefined;
          return urlProp?.type === "url" && urlProp.url ? urlProp.url : "";
        };
        relatedFaqQuestion = getTitle();
        relatedFaqQuestionNl = getText("Question (NL)");
        relatedFaqQuestionDe = getText("Question (DE)");
        relatedFaqAnswer = getRichTextMd(faqProps, "Answer (EN)");
        relatedFaqAnswerNl = getRichTextMd(faqProps, "Answer (NL)");
        relatedFaqAnswerDe = getRichTextMd(faqProps, "Answer (DE)");
        relatedFaqUrl = getUrl();
      }
    }

    // Resolve Next Steps from text field (comma-separated step names)
    const nextDialogFlow: FlowOption[] = [];
    for (const stepName of p.nextStepNames) {
      const target = stepByName.get(stepName);
      if (!target) {
        console.warn(`Next step "${stepName}" not found (referenced by "${p.name}")`);
        continue;
      }
      nextDialogFlow.push({
        name: target.name,
        label: target.label || target.name,
        labelNl: "",
        labelDe: "",
        icon: target.icon,
      });
    }

    if (p.name && (p.message || p.endAction === "Start AI Chat")) {
      steps.push({ name: p.name, message: p.message, messageNl: "", messageDe: "", nextDialogFlow, endAction: p.endAction, contextKey: p.contextKey, endPrompt: p.endPrompt, endPromptNl: "", endPromptDe: "", relatedFaqQuestion, relatedFaqQuestionNl, relatedFaqQuestionDe, relatedFaqAnswer, relatedFaqAnswerNl, relatedFaqAnswerDe, relatedFaqUrl, order: p.order });
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

  const DELIM = "---NEXT---";

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const joined = strings.join(`\n${DELIM}\n`);
    const prompt = `Translate each block below to ${targetLang}. Blocks are separated by "${DELIM}". Return ONLY the translations separated by "${DELIM}" on its own line. Preserve all formatting, bullet points, and line breaks within each block. Do not add explanations.\n\n${joined}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Split on delimiter
    const blocks = text.split(DELIM).map((b) => b.trim());
    const translations: string[] = new Array(strings.length).fill("");
    for (let i = 0; i < Math.min(blocks.length, strings.length); i++) {
      if (blocks[i]) translations[i] = blocks[i];
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
