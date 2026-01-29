import { Part } from "@google/generative-ai";
import { fetchAllFiles } from "./google-drive";
import { getOrUploadFile, buildFileParts } from "./gemini-files";

interface DocumentContext {
  systemInstructionText: string;
  fileParts: Part[];
  fileNames: string[];
}

// Module-level cache
let cachedContext: DocumentContext | null = null;
let cacheTimestamp = 0;
let fetchInProgress: Promise<DocumentContext> | null = null;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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

  cachedContext = context;
  cacheTimestamp = Date.now();

  return context;
}

export function getKnowledgeBaseStatus() {
  if (!cachedContext) {
    return {
      status: "not_synced" as const,
      fileCount: 0,
      fileNames: [] as string[],
      lastSynced: null,
    };
  }

  return {
    status: "synced" as const,
    fileCount: cachedContext.fileNames.length,
    fileNames: cachedContext.fileNames,
    lastSynced: new Date(cacheTimestamp).toISOString(),
  };
}

export async function getDocumentContext(): Promise<DocumentContext> {
  if (cachedContext && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedContext;
  }

  // Prevent concurrent fetches
  if (fetchInProgress) {
    return fetchInProgress;
  }

  fetchInProgress = doFetchDocumentContext();
  try {
    return await fetchInProgress;
  } finally {
    fetchInProgress = null;
  }
}
