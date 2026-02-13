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
import { queryDocuments, isVectorConfigured, type QueryMatch } from "./vector";

export interface DocumentContext {
  systemInstructionText: string;
  fileParts: Part[];
  fileNames: string[];
}

export interface RagResult {
  systemInstructionText: string;
  sourceFiles: string[];
}

export interface BinaryDocumentContext {
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
    // Only use L1 for filtering if cachedFiles is populated (not after KV restore)
    if (cachedFiles.length > 0) {
      return buildFilteredContext(allowedFolders);
    }
    // Fall through to L3 to populate cachedFiles for folder filtering
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

// --- RAG retrieval ---

/**
 * Query the vector store for document chunks relevant to the user's message.
 * Falls back to full text context if vector store is not configured.
 */
export async function getRelevantDocuments(
  query: string,
  allowedFolders: string[],
): Promise<RagResult | null> {
  if (!isVectorConfigured()) {
    // Fallback: return full text from the old getDocumentContext path
    const ctx = await getDocumentContext(allowedFolders);
    return ctx.systemInstructionText
      ? { systemInstructionText: ctx.systemInstructionText, sourceFiles: ctx.fileNames }
      : null;
  }

  try {
    // Fetch more candidates than needed, then diversify across documents
    const MAX_CHUNKS_PER_FILE = 5;
    const TARGET_CHUNKS = 15;
    const matches = await queryDocuments(query, allowedFolders, 40);

    // Filter out low-relevance chunks
    const MIN_SCORE = 0.75;
    const aboveThreshold = matches.filter((m) => m.score >= MIN_SCORE);

    // Diversify: limit chunks per document so one file doesn't dominate
    const fileChunkCounts = new Map<string, number>();
    const relevant: QueryMatch[] = [];
    for (const m of aboveThreshold) {
      const count = fileChunkCounts.get(m.fileName) ?? 0;
      if (count >= MAX_CHUNKS_PER_FILE) continue;
      fileChunkCounts.set(m.fileName, count + 1);
      relevant.push(m);
      if (relevant.length >= TARGET_CHUNKS) break;
    }

    const scores = matches.slice(0, 20).map((m) => `${m.score.toFixed(3)}[${m.fileName.slice(0, 30)}]`);
    const sourceFiles = [...new Set(matches.map((m) => m.fileName))];
    console.log(`RAG: retrieved ${matches.length} chunks from ${sourceFiles.length} files (${sourceFiles.join(", ")}) for query: "${query.slice(0, 80)}"`);
    console.log(`RAG scores (top 20): ${scores.join(", ")}`);
    console.log(`RAG: diversified to ${relevant.length} chunks from ${fileChunkCounts.size} files (max ${MAX_CHUNKS_PER_FILE}/file)`);

    if (relevant.length === 0) {
      // No chunks scored high enough — fall back to full text context
      console.log("RAG: no relevant chunks found, falling back to full text context");
      const ctx = await getDocumentContext(allowedFolders);
      return ctx.systemInstructionText
        ? { systemInstructionText: ctx.systemInstructionText, sourceFiles: ctx.fileNames }
        : null;
    }

    // Build RAG context from diversified chunks
    const ragParts = relevant
      .map((m) => `=== ${m.fileName} (excerpt) ===\n${m.text}`)
      .join("\n\n");

    // Always include full text of small documents (reference sheets, checklists, etc.)
    // These are too small for RAG to find reliably but contain critical information.
    const SMALL_FILE_THRESHOLD = 6400; // ~2 chunks worth of text
    const smallDocParts: string[] = [];
    const ragFileNames = new Set(relevant.map((m) => m.fileName));

    if (cachedFiles.length > 0) {
      const accessibleFiles = filterFilesByFolder(cachedFiles, allowedFolders);
      const smallTextFiles = accessibleFiles.filter(
        (f) => f.isText && f.content.length > 0 && f.content.length <= SMALL_FILE_THRESHOLD
      );

      for (const f of smallTextFiles) {
        if (!ragFileNames.has(f.name)) {
          smallDocParts.push(`=== ${f.name} ===\n${f.content}`);
          ragFileNames.add(f.name);
        }
      }

      if (smallDocParts.length > 0) {
        console.log(`RAG: appending ${smallDocParts.length} small documents in full`);
      }
    }

    const systemInstructionText = smallDocParts.length > 0
      ? ragParts + "\n\n=== Reference Documents (full text) ===\n\n" + smallDocParts.join("\n\n")
      : ragParts;

    const relevantSourceFiles = [...ragFileNames];

    return { systemInstructionText, sourceFiles: relevantSourceFiles };
  } catch (err) {
    console.warn("RAG query failed, falling back to full text context:", err);
    const ctx = await getDocumentContext(allowedFolders);
    return ctx.systemInstructionText
      ? { systemInstructionText: ctx.systemInstructionText, sourceFiles: ctx.fileNames }
      : null;
  }
}

/**
 * Get only binary file context (scanned PDFs, images) for Gemini File API.
 * Used alongside RAG retrieval -- text documents come from the vector store.
 */
export async function getBinaryDocumentContext(
  allowedFolders?: string[],
): Promise<BinaryDocumentContext> {
  // Ensure files are loaded (reuse existing cache/fetch mechanism)
  await getDocumentContext(allowedFolders);

  const files = allowedFolders
    ? filterFilesByFolder(cachedFiles, allowedFolders)
    : cachedFiles;

  const binaryFiles = files.filter((f) => !f.isText);

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
    fileParts,
    fileNames: binaryFiles.map((f) => f.name),
  };
}
