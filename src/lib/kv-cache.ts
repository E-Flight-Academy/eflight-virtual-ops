import { Redis } from "@upstash/redis";

// --- Keys ---
const KB_CONTEXT_KEY = "kb:context";
const KB_GEMINI_URIS_KEY = "kb:gemini-uris";
const KB_STATUS_KEY = "kb:status";

// --- TTLs (seconds) ---
const CONTEXT_TTL = 3600;       // 1 hour
const GEMINI_URIS_TTL = 169200; // 47 hours
const STATUS_TTL = 3600;        // 1 hour

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
}

// --- Redis client (lazy) ---
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
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
