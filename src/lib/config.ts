import { Client } from "@notionhq/client";
import { getKvConfig, setKvConfig, type KvConfigData } from "./kv-cache";

// L1: in-memory cache
let cachedConfig: KvConfigData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DEFAULT_CONFIG: KvConfigData = {
  tone_of_voice: "professional, friendly, and helpful",
  company_context: "E-Flight Academy is a flight training academy.",
  search_order: ["faq", "drive"],
  cachedAt: 0,
};

export async function fetchConfigFromNotion(): Promise<KvConfigData> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_CONFIG_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("NOTION_API_KEY or NOTION_CONFIG_DATABASE_ID not configured, using defaults");
    return { ...DEFAULT_CONFIG, cachedAt: Date.now() };
  }

  const notion = new Client({ auth: apiKey });

  const response = await notion.databases.query({
    database_id: databaseId,
  });

  const config: Record<string, string> = {};

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    const props = page.properties;
    let key = "";
    let value = "";

    for (const [propName, propValue] of Object.entries(props)) {
      if (propValue.type === "title" && propValue.title.length > 0) {
        key = propValue.title
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
      if (
        propName === "Value" &&
        propValue.type === "rich_text" &&
        propValue.rich_text.length > 0
      ) {
        value = propValue.rich_text
          .map((t: { plain_text: string }) => t.plain_text)
          .join("");
      }
    }

    if (key) {
      config[key] = value;
    }
  }

  const searchOrderRaw = config["search_order"] || "faq,drive";
  const searchOrder = searchOrderRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const result: KvConfigData = {
    tone_of_voice: config["tone_of_voice"] || DEFAULT_CONFIG.tone_of_voice,
    company_context: config["company_context"] || DEFAULT_CONFIG.company_context,
    search_order: searchOrder,
    cachedAt: Date.now(),
  };

  return result;
}

export async function syncConfig(): Promise<KvConfigData> {
  const config = await fetchConfigFromNotion();
  cachedConfig = config;
  cacheTimestamp = Date.now();
  await setKvConfig(config);
  return config;
}

export async function getConfig(): Promise<KvConfigData> {
  // L1: in-memory
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // L2: Redis
  try {
    const kvConfig = await getKvConfig();
    if (kvConfig && Date.now() - kvConfig.cachedAt < CACHE_TTL_MS) {
      cachedConfig = kvConfig;
      cacheTimestamp = kvConfig.cachedAt;
      return kvConfig;
    }
  } catch {
    // Fall through
  }

  // L3: Fetch from Notion
  try {
    return await syncConfig();
  } catch (err) {
    console.error("Failed to fetch config from Notion:", err);
    return cachedConfig || DEFAULT_CONFIG;
  }
}
