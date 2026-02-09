import { Part } from "@google/generative-ai";
import { fetchAllFiles, type DriveFileContent } from "./google-drive";
import { getOrUploadFile, buildFileParts, getUploadedFilesMap } from "./gemini-files";
import {
  getKvContext, setKvContext,
  getKvGeminiUris, setKvGeminiUris,
  getKvStatus, setKvStatus,
  getKvFaqs,
  getKvWebsite,
  type KvGeminiUris,
} from "./kv-cache";

interface DocumentContext {
  systemInstructionText: string;
  fileParts: Part[];
  fileNames: string[];
}

// Store files with folder info for filtering
let cachedFiles: DriveFileContent[] = [];

/**
 * Filter files based on allowed folders
 * @param files All files from Drive
 * @param allowedFolders Folders the user can access (or ["*"] for all)
 */
function filterFilesByFolder(files: DriveFileContent[], allowedFolders: string[]): DriveFileContent[] {
  // If user has access to all folders
  if (allowedFolders.includes("*")) {
    return files;
  }

  // Normalize folder names to lowercase for comparison
  const normalizedAllowed = new Set(allowedFolders.map(f => f.toLowerCase()));

  return files.filter(file => {
    const fileFolder = (file.folder || "public").toLowerCase();
    return normalizedAllowed.has(fileFolder);
  });
}

// L1: Module-level in-memory cache
let cachedContext: DocumentContext | null = null;
let cacheTimestamp = 0;
let fetchInProgress: Promise<DocumentContext> | null = null;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function clearDocumentCache(): Promise<void> {
  // Clear L1 in-memory cache
  cachedContext = null;
  cacheTimestamp = 0;
  fetchInProgress = null;

  // Clear L2 KV cache by setting expired timestamp
  try {
    await setKvContext({
      systemInstructionText: "",
      fileNames: [],
      cachedAt: 0, // Forces re-fetch on next access
    });
    await setKvStatus({
      status: "not_synced",
      fileCount: 0,
      fileNames: [],
      lastSynced: null,
    });
  } catch {
    // Non-fatal
  }

  console.log("Document cache cleared (L1 + L2)");
}

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

  // Store files for later filtering
  cachedFiles = files;

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
  // Try to get faqCount and websitePageCount from KV caches
  let faqCount: number | undefined;
  let websitePageCount: number | undefined;
  try {
    const [kvFaqs, kvWebsite] = await Promise.all([
      getKvFaqs(),
      getKvWebsite(),
    ]);
    if (kvFaqs) faqCount = kvFaqs.faqs.length;
    if (kvWebsite) websitePageCount = kvWebsite.pages.length;
  } catch {
    // Non-fatal
  }

  // L1: in-memory
  if (cachedContext) {
    return {
      status: "synced" as const,
      fileCount: cachedContext.fileNames.length,
      fileNames: cachedContext.fileNames,
      lastSynced: new Date(cacheTimestamp).toISOString(),
      faqCount,
      websitePageCount,
    };
  }

  // L2: KV
  try {
    const kvStatus = await getKvStatus();
    if (kvStatus) return { ...kvStatus, faqCount: kvStatus.faqCount ?? faqCount, websitePageCount };
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

export async function getDocumentContext(allowedFolders?: string[]): Promise<DocumentContext> {
  // L1: in-memory
  if (cachedContext && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    // If no folder filter, return full cache
    if (!allowedFolders || allowedFolders.includes("*")) {
      return cachedContext;
    }
    // Filter cached files by folder and rebuild context
    return buildFilteredContext(allowedFolders);
  }

  // Prevent concurrent fetches
  if (fetchInProgress) {
    const result = await fetchInProgress;
    if (allowedFolders && !allowedFolders.includes("*")) {
      return buildFilteredContext(allowedFolders);
    }
    return result;
  }

  // L2: try KV before full fetch
  const kvRestored = await tryRestoreFromKv();
  if (kvRestored) {
    if (allowedFolders && !allowedFolders.includes("*")) {
      // For KV restore, we don't have file folder info, so refetch
      // This is a rare case - usually L1 cache is warm
    } else {
      return kvRestored;
    }
  }

  // L3: full fetch from Drive + Gemini
  fetchInProgress = doFetchDocumentContext();
  try {
    const result = await fetchInProgress;
    if (allowedFolders && !allowedFolders.includes("*")) {
      return buildFilteredContext(allowedFolders);
    }
    return result;
  } finally {
    fetchInProgress = null;
  }
}

/**
 * Build a filtered document context from cached files
 */
async function buildFilteredContext(allowedFolders: string[]): Promise<DocumentContext> {
  if (cachedFiles.length === 0) {
    // No cached files, return empty context
    return { systemInstructionText: "", fileParts: [], fileNames: [] };
  }

  const filteredFiles = filterFilesByFolder(cachedFiles, allowedFolders);

  console.log(`Filtering documents: ${cachedFiles.length} total → ${filteredFiles.length} accessible (folders: ${allowedFolders.join(", ")})`);

  const textFiles = filteredFiles.filter((f) => f.isText);
  const binaryFiles = filteredFiles.filter((f) => !f.isText);

  // Build system instruction text from filtered text files
  const systemInstructionText = textFiles
    .map((f) => `=== ${f.name} ===\n${f.content}`)
    .join("\n\n");

  // Get file parts for filtered binary files (they should already be uploaded)
  const uploadsMap = getUploadedFilesMap();
  const fileParts: Part[] = [];
  for (const f of binaryFiles) {
    const uploaded = uploadsMap.get(f.id);
    if (uploaded) {
      fileParts.push({
        fileData: {
          fileUri: uploaded.uri,
          mimeType: uploaded.mimeType,
        },
      });
    }
  }

  return {
    systemInstructionText,
    fileParts,
    fileNames: filteredFiles.map((f) => f.name),
  };
}
