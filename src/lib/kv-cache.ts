import { Redis } from "@upstash/redis";

// --- Keys ---
const KB_CONTEXT_KEY = "kb:context";
const KB_GEMINI_URIS_KEY = "kb:gemini-uris";
const KB_STATUS_KEY = "kb:status";
const KB_CONFIG_KEY = "kb:config";
const KB_FAQS_KEY = "kb:faqs";

// --- TTLs (seconds) ---
const CONTEXT_TTL = 3600;       // 1 hour
const GEMINI_URIS_TTL = 169200; // 47 hours
const STATUS_TTL = 3600;        // 1 hour
const CONFIG_TTL = 3600;        // 1 hour
const FAQS_TTL = 3600;          // 1 hour
const KB_WEBSITE_KEY = "kb:website";
const WEBSITE_TTL = 21600;      // 6 hours
const KB_FLOWS_KEY = "kb:flows";
const FLOWS_TTL = 3600;         // 1 hour
const I18N_KEY_PREFIX = "i18n:";
const I18N_TTL = 2592000;       // 30 days
const I18N_STARTERS_KEY_PREFIX = "i18n:starters:";
const I18N_STARTERS_TTL = 2592000; // 30 days
const SHARED_CHAT_KEY_PREFIX = "chat:";
const SHARED_CHAT_TTL = 2592000;   // 30 days

// --- Types ---
export interface KvContextData {
  systemInstructionText: string;
  fileNames: string[];
  cachedAt: number;
}

export interface KvGeminiUri {
  uri: string;
  mimeType: string;
  displayName: string;
  uploadedAt: number;
}

export type KvGeminiUris = Record<string, KvGeminiUri>;

export interface KvStatusData {
  status: "synced" | "not_synced" | "loading";
  fileCount: number;
  fileNames: string[];
  lastSynced: string | null;
  warmStartedAt?: number;
  faqCount?: number;
}

export interface KvConfigData {
  tone_of_voice: string;
  company_context: string;
  search_order: string[];
  fallback_instruction: string;
  website_pages?: string[];
  cachedAt: number;
  [key: string]: unknown;
}

export interface KvWebsitePage {
  url: string;
  title: string;
  content: string;
  fetchedAt: number;
}

export interface KvWebsiteData {
  pages: KvWebsitePage[];
  cachedAt: number;
}

export interface KvFaq {
  question: string;
  questionNl: string;
  questionDe: string;
  answer: string;
  answerNl: string;
  answerDe: string;
}

export interface KvFaqsData {
  faqs: KvFaq[];
  cachedAt: number;
}

export interface KvFlowStep {
  name: string;
  message: string;
  options: string[];
  nextFlow: Record<string, string>;
  endAction: "Continue Flow" | "Start AI Chat";
  contextKey: string;
  endPrompt: string;
  order: number;
}

export interface KvFlowsData {
  steps: KvFlowStep[];
  cachedAt: number;
}

export interface KvTranslation {
  lang: string;
  labels: Record<string, string>;
  generatedAt: number;
}

export interface KvStarterTranslation {
  lang: string;
  questions: string[];
  generatedAt: number;
}

export interface KvSharedChat {
  messages: { role: "user" | "assistant"; content: string }[];
  flowContext: Record<string, string>;
  lang: string;
  sharedAt: number;
}

// --- Redis client (lazy) ---
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    redis = Redis.fromEnv();
    return redis;
  } catch {
    return null;
  }
}

// --- Context ---
export async function getKvContext(): Promise<KvContextData | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvContextData>(KB_CONTEXT_KEY);
  } catch {
    return null;
  }
}

export async function setKvContext(data: KvContextData): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_CONTEXT_KEY, data, { ex: CONTEXT_TTL });
  } catch {
    // Non-fatal
  }
}

// --- Gemini URIs ---
export async function getKvGeminiUris(): Promise<KvGeminiUris | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvGeminiUris>(KB_GEMINI_URIS_KEY);
  } catch {
    return null;
  }
}

export async function setKvGeminiUris(data: KvGeminiUris): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_GEMINI_URIS_KEY, data, { ex: GEMINI_URIS_TTL });
  } catch {
    // Non-fatal
  }
}

// --- Status ---
export async function getKvStatus(): Promise<KvStatusData | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvStatusData>(KB_STATUS_KEY);
  } catch {
    return null;
  }
}

export async function setKvStatus(data: KvStatusData): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_STATUS_KEY, data, { ex: STATUS_TTL });
  } catch {
    // Non-fatal
  }
}

// --- Config ---
export async function getKvConfig(): Promise<KvConfigData | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvConfigData>(KB_CONFIG_KEY);
  } catch {
    return null;
  }
}

export async function setKvConfig(data: KvConfigData): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_CONFIG_KEY, data, { ex: CONFIG_TTL });
  } catch {
    // Non-fatal
  }
}

// --- FAQs ---
export async function getKvFaqs(): Promise<KvFaqsData | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvFaqsData>(KB_FAQS_KEY);
  } catch {
    return null;
  }
}

export async function setKvFaqs(data: KvFaqsData): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_FAQS_KEY, data, { ex: FAQS_TTL });
  } catch {
    // Non-fatal
  }
}

// --- Website ---
export async function getKvWebsite(): Promise<KvWebsiteData | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvWebsiteData>(KB_WEBSITE_KEY);
  } catch {
    return null;
  }
}

export async function setKvWebsite(data: KvWebsiteData): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_WEBSITE_KEY, data, { ex: WEBSITE_TTL });
  } catch {
    // Non-fatal
  }
}

// --- Guided Flows ---
export async function getKvFlows(): Promise<KvFlowsData | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvFlowsData>(KB_FLOWS_KEY);
  } catch {
    return null;
  }
}

export async function setKvFlows(data: KvFlowsData): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(KB_FLOWS_KEY, data, { ex: FLOWS_TTL });
  } catch {
    // Non-fatal
  }
}

// --- i18n Translations ---
export async function getKvTranslation(lang: string): Promise<KvTranslation | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvTranslation>(`${I18N_KEY_PREFIX}${lang}`);
  } catch {
    return null;
  }
}

export async function setKvTranslation(data: KvTranslation): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(`${I18N_KEY_PREFIX}${data.lang}`, data, { ex: I18N_TTL });
  } catch {
    // Non-fatal
  }
}

// --- i18n Starter Translations ---
export async function getKvStarterTranslation(lang: string): Promise<KvStarterTranslation | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvStarterTranslation>(`${I18N_STARTERS_KEY_PREFIX}${lang}`);
  } catch {
    return null;
  }
}

export async function setKvStarterTranslation(data: KvStarterTranslation): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(`${I18N_STARTERS_KEY_PREFIX}${data.lang}`, data, { ex: I18N_STARTERS_TTL });
  } catch {
    // Non-fatal
  }
}

// --- Shared Chats ---
export async function getKvSharedChat(id: string): Promise<KvSharedChat | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get<KvSharedChat>(`${SHARED_CHAT_KEY_PREFIX}${id}`);
  } catch {
    return null;
  }
}

export async function setKvSharedChat(id: string, data: KvSharedChat): Promise<boolean> {
  try {
    const r = getRedis();
    if (!r) return false;
    await r.set(`${SHARED_CHAT_KEY_PREFIX}${id}`, data, { ex: SHARED_CHAT_TTL });
    return true;
  } catch {
    return false;
  }
}
