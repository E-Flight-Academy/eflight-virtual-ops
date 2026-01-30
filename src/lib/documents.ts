import { Part } from "@google/generative-ai";
import { fetchAllFiles } from "./google-drive";
import { getOrUploadFile, buildFileParts, getUploadedFilesMap } from "./gemini-files";
import {
  getKvContext, setKvContext,
  getKvGeminiUris, setKvGeminiUris,
  getKvStatus, setKvStatus,
  type KvGeminiUris,
} from "./kv-cache";

interface DocumentContext {
  systemInstructionText: string;
  fileParts: Part[];
  fileNames: string[];
}

// L1: Module-level in-memory cache
let cachedContext: DocumentContext | null = null;
let cacheTimestamp = 0;
let fetchInProgress: Promise<DocumentContext> | null = null;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// L2: Try to restore from KV
async function tryRestoreFromKv(): Promise<DocumentContext | null> {
  try {
    const [kvContext, kvUris] = await Promise.all([
      getKvContext(),
      getKvGeminiUris(),
    ]);

    if (!kvContext) return null;
    if (Date.now() - kvContext.cachedAt > CACHE_TTL_MS) return null;

    // Reconstruct fileParts from persisted Gemini URIs
    const validUris = kvUris
      ? Object.values(kvUris).filter(
          (u) => Date.now() - u.uploadedAt < 47 * 60 * 60 * 1000
        )
      : [];
    const fileParts = buildFileParts(validUris);

    const context: DocumentContext = {
      systemInstructionText: kvContext.systemInstructionText,
      fileParts,
      fileNames: kvContext.fileNames,
    };

    // Populate L1
    cachedContext = context;
    cacheTimestamp = kvContext.cachedAt;

    return context;
  } catch (err) {
    console.warn("KV restore failed, falling back to full fetch:", err);
    return null;
  }
}

// L3: Full fetch from Google Drive + Gemini upload
async function doFetchDocumentContext(): Promise<DocumentContext> {
  const files = await fetchAllFiles();

  const textFiles = files.filter((f) => f.isText);
  const binaryFiles = files.filter((f) => !f.isText);

  // Build system instruction text from text documents
  const systemInstructionText = textFiles
    .map((f) => `=== ${f.name} ===\n${f.content}`)
    .join("\n\n");

  // Upload binary files to Gemini and build file parts
  const uploadedFiles = await Promise.all(
    binaryFiles.map((f) =>
      getOrUploadFile(f.id, f.buffer!, f.name, f.mimeType)
    )
  );
  const fileParts = buildFileParts(uploadedFiles);

  const fileNames = files.map((f) => f.name);

  const context: DocumentContext = {
    systemInstructionText,
    fileParts,
    fileNames,
  };

  // Populate L1
  cachedContext = context;
  cacheTimestamp = Date.now();

  // Write to L2 (KV) — must await so writes complete before serverless function exits
  const kvUrisMap: KvGeminiUris = {};
  const uploadsMap = getUploadedFilesMap();
  for (const [id, data] of uploadsMap.entries()) {
    kvUrisMap[id] = data;
  }

  try {
    // Preserve faqCount from existing status (written by sync-notion)
    const existingStatus = await getKvStatus();
    await Promise.all([
      setKvContext({
        systemInstructionText,
        fileNames,
        cachedAt: cacheTimestamp,
      }),
      setKvGeminiUris(kvUrisMap),
      setKvStatus({
        status: "synced",
        fileCount: fileNames.length,
        fileNames,
        lastSynced: new Date(cacheTimestamp).toISOString(),
        faqCount: existingStatus?.faqCount,
      }),
    ]);
  } catch (err) {
    console.warn("KV write failed:", err);
  }

  return context;
}

export async function getKnowledgeBaseStatus() {
  // L1: in-memory
  if (cachedContext) {
    return {
      status: "synced" as const,
      fileCount: cachedContext.fileNames.length,
      fileNames: cachedContext.fileNames,
      lastSynced: new Date(cacheTimestamp).toISOString(),
    };
  }

  // L2: KV
  try {
    const kvStatus = await getKvStatus();
    if (kvStatus) return kvStatus;
  } catch {
    // Fall through
  }

  return {
    status: "not_synced" as const,
    fileCount: 0,
    fileNames: [] as string[],
    lastSynced: null,
  };
}

export async function getDocumentContext(): Promise<DocumentContext> {
  // L1: in-memory
  if (cachedContext && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedContext;
  }

  // Prevent concurrent fetches
  if (fetchInProgress) {
    return fetchInProgress;
  }

  // L2: try KV before full fetch
  const kvRestored = await tryRestoreFromKv();
  if (kvRestored) return kvRestored;

  // L3: full fetch from Drive + Gemini
  fetchInProgress = doFetchDocumentContext();
  try {
    return await fetchInProgress;
  } finally {
    fetchInProgress = null;
  }
}
