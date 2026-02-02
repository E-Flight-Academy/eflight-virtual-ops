import { Client } from "@notionhq/client";
import {
  getKvFlows,
  setKvFlows,
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
    let options: string[] = [];
    let nextFlowRaw = "";
    let endAction: "Continue Flow" | "Start AI Chat" = "Continue Flow";
    let contextKey = "";
    let endPrompt = "";
    let order = 0;

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
      if (key === "Options" && value.type === "multi_select") {
        options = value.multi_select.map(
          (opt: { name: string }) => opt.name
        );
      }
      if (
        key === "Next Flow" &&
        value.type === "rich_text" &&
        value.rich_text.length > 0
      ) {
        nextFlowRaw = value.rich_text
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
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
    }

    // Parse nextFlow JSON safely
    let nextFlow: Record<string, string> = {};
    if (nextFlowRaw) {
      try {
        nextFlow = JSON.parse(nextFlowRaw);
      } catch (err) {
        console.warn(`Invalid Next Flow JSON for step "${name}":`, err);
      }
    }

    if (name && message) {
      steps.push({ name, message, options, nextFlow, endAction, contextKey, endPrompt, order });
    }
  }

  return steps;
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
