import { Index } from "@upstash/vector";
import { embedText, embedTexts } from "./embeddings";
import { fetchAllFiles, type DriveFileContent } from "./google-drive";
import type { KvWebsitePage } from "./kv-cache";
import type { KvFaq } from "./kv-cache";

// --- Types ---

interface ChunkMetadata extends Record<string, unknown> {
  folder: string;
  fileName: string;
  driveFileId: string;
  chunkIndex: number;
  text: string; // chunk content stored in metadata for retrieval
  source?: "drive" | "website" | "faq";
  url?: string;
  pageTitle?: string;
  faqQuestion?: string;
  faqCategory?: string;
  faqAudience?: string;
}

export interface QueryMatch {
  text: string;
  fileName: string;
  folder: string;
  score: number;
}

interface DocumentChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

// --- Config ---

const TARGET_CHUNK_CHARS = 3200; // ~800 tokens
const OVERLAP_CHARS = 400; // ~100 tokens
const UPSERT_BATCH_SIZE = 100;

// --- Vector client (lazy) ---

let vectorIndex: Index<ChunkMetadata> | null = null;

function getVectorIndex(): Index<ChunkMetadata> | null {
  if (vectorIndex) return vectorIndex;
  try {
    vectorIndex = Index.fromEnv() as Index<ChunkMetadata>;
    return vectorIndex;
  } catch {
    return null;
  }
}

/**
 * Check if vector store is configured and available.
 */
export function isVectorConfigured(): boolean {
  return !!(process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN);
}

// --- Chunking ---

/**
 * Split a document into overlapping chunks by paragraph boundaries.
 */
export function chunkDocument(file: DriveFileContent): DocumentChunk[] {
  const { id, name, content, folder } = file;
  if (!content.trim()) return [];

  // Split on double newlines (paragraph boundaries)
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());

  const chunks: DocumentChunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    // If adding this paragraph would exceed target, finalize current chunk
    if (currentChunk && currentChunk.length + trimmed.length + 2 > TARGET_CHUNK_CHARS) {
      const text = currentChunk.trim();
      chunks.push({
        id: `${id}:${chunkIndex}`,
        text,
        metadata: { folder: folder.toLowerCase(), fileName: name, driveFileId: id, chunkIndex, text, source: "drive" },
      });

      // Start new chunk with overlap from end of previous
      const overlap = currentChunk.slice(-OVERLAP_CHARS);
      currentChunk = overlap + "\n\n" + trimmed;
      chunkIndex++;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  // Final chunk
  if (currentChunk.trim()) {
    const text = currentChunk.trim();
    chunks.push({
      id: `${id}:${chunkIndex}`,
      text,
      metadata: { folder: folder.toLowerCase(), fileName: name, driveFileId: id, chunkIndex, text, source: "drive" },
    });
  }

  return chunks;
}

// --- Indexing ---

/**
 * Index all text documents from Google Drive into the vector store.
 * Called during sync. Handles chunking, embedding, upserting, and cleanup.
 */
export async function syncVectorIndex(): Promise<{ fileCount: number; chunkCount: number }> {
  const index = getVectorIndex();
  if (!index) {
    console.warn("Vector index not configured, skipping vector sync");
    return { fileCount: 0, chunkCount: 0 };
  }

  const startTime = Date.now();

  // Fetch all files from Drive
  const files = await fetchAllFiles();
  const textFiles = files.filter((f) => f.isText);

  // Chunk all text files
  const allChunks: DocumentChunk[] = [];
  const currentDriveFileIds = new Set<string>();

  for (const file of textFiles) {
    currentDriveFileIds.add(file.id);
    const chunks = chunkDocument(file);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    console.log("Vector sync: no text documents to index");
    return { fileCount: 0, chunkCount: 0 };
  }

  // Embed all chunks
  const texts = allChunks.map((c) => c.text);
  const vectors = await embedTexts(texts);

  // Upsert in batches
  for (let i = 0; i < allChunks.length; i += UPSERT_BATCH_SIZE) {
    const batchChunks = allChunks.slice(i, i + UPSERT_BATCH_SIZE);
    const batchVectors = vectors.slice(i, i + UPSERT_BATCH_SIZE);

    await index.upsert(
      batchChunks.map((chunk, j) => ({
        id: chunk.id,
        vector: batchVectors[j],
        metadata: chunk.metadata,
      }))
    );
  }

  // Clean up orphaned vectors from deleted files
  try {
    let cursor = "0";
    const orphanIds: string[] = [];

    do {
      const page = await index.range({
        cursor,
        limit: 100,
        includeMetadata: true,
      });

      for (const vec of page.vectors) {
        // Only clean orphans from drive source (not website/faq)
        if (vec.metadata?.source !== "drive" && vec.metadata?.driveFileId) continue;
        const driveId = vec.metadata?.driveFileId;
        if (driveId && !currentDriveFileIds.has(driveId)) {
          orphanIds.push(vec.id as string);
        }
      }

      cursor = page.nextCursor;
    } while (cursor && cursor !== "0");

    if (orphanIds.length > 0) {
      await index.delete(orphanIds);
      console.log(`Vector sync: deleted ${orphanIds.length} orphaned chunks`);
    }
  } catch (err) {
    console.warn("Vector sync: orphan cleanup failed:", err);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  // Log chunks per file for debugging
  const chunksPerFile = new Map<string, number>();
  for (const chunk of allChunks) {
    const name = chunk.metadata.fileName;
    chunksPerFile.set(name, (chunksPerFile.get(name) ?? 0) + 1);
  }
  for (const [name, count] of chunksPerFile) {
    console.log(`  ${name}: ${count} chunks`);
  }
  console.log(`Vector sync: indexed ${allChunks.length} chunks from ${textFiles.length} files in ${duration}s`);

  return { fileCount: textFiles.length, chunkCount: allChunks.length };
}

// --- Querying ---

/**
 * Query the vector store for relevant document chunks.
 * Filters by allowed folders for role-based access control.
 */
export async function queryDocuments(
  query: string,
  allowedFolders: string[],
  topK: number = 10
): Promise<QueryMatch[]> {
  const index = getVectorIndex();
  if (!index) return [];

  const queryVector = await embedText(query);

  // Build metadata filter for role-based access
  // Note: source filter omitted because legacy vectors lack source field;
  // drive vectors are distinguished by having a driveFileId
  const parts: string[] = [];
  if (!allowedFolders.includes("*")) {
    const normalized = allowedFolders.map((f) => f.toLowerCase());
    const folderFilter = normalized.map((f) => `folder = '${f}'`).join(" OR ");
    parts.push(`(${folderFilter})`);
  }
  const filter = parts.join(" AND ");

  const results = await index.query<ChunkMetadata>({
    vector: queryVector,
    topK,
    filter,
    includeMetadata: true,
  });

  return results
    .filter((r) => r.metadata?.text)
    .map((result) => ({
      text: result.metadata!.text,
      fileName: result.metadata!.fileName,
      folder: result.metadata!.folder,
      score: result.score,
    }));
}

// --- Website vector indexing ---

export interface WebsiteMatch {
  text: string;
  url: string;
  title: string;
  score: number;
}

/**
 * Index website pages into the vector store.
 * Each page is chunked by paragraphs, similar to Drive documents.
 */
export async function syncWebsiteVectorIndex(pages: KvWebsitePage[]): Promise<{ pageCount: number; chunkCount: number }> {
  const index = getVectorIndex();
  if (!index) {
    console.warn("Vector index not configured, skipping website vector sync");
    return { pageCount: 0, chunkCount: 0 };
  }

  const startTime = Date.now();

  // Clean existing website chunks first
  try {
    let cursor = "0";
    const orphanIds: string[] = [];
    do {
      const page = await index.range({ cursor, limit: 100, includeMetadata: true });
      for (const vec of page.vectors) {
        if (vec.metadata?.source === "website") {
          orphanIds.push(vec.id as string);
        }
      }
      cursor = page.nextCursor;
    } while (cursor && cursor !== "0");

    if (orphanIds.length > 0) {
      for (let i = 0; i < orphanIds.length; i += UPSERT_BATCH_SIZE) {
        await index.delete(orphanIds.slice(i, i + UPSERT_BATCH_SIZE));
      }
      console.log(`Website vector sync: deleted ${orphanIds.length} old chunks`);
    }
  } catch (err) {
    console.warn("Website vector sync: cleanup failed:", err);
  }

  // Chunk each page
  const allChunks: { id: string; text: string; metadata: ChunkMetadata }[] = [];

  for (const page of pages) {
    if (!page.content.trim()) continue;

    // Split on sentence boundaries for website content (already collapsed whitespace)
    const sentences = page.content.split(/(?<=[.!?])\s+/);
    let currentChunk = "";
    let chunkIndex = 0;

    for (const sentence of sentences) {
      if (currentChunk && currentChunk.length + sentence.length + 1 > TARGET_CHUNK_CHARS) {
        const text = currentChunk.trim();
        const id = `web:${encodeURIComponent(page.url)}:${chunkIndex}`;
        allChunks.push({
          id,
          text,
          metadata: {
            folder: "public",
            fileName: page.title,
            driveFileId: "",
            chunkIndex,
            text,
            source: "website",
            url: page.url,
            pageTitle: page.title,
          },
        });
        currentChunk = sentence;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }

    // Final chunk
    if (currentChunk.trim()) {
      const text = currentChunk.trim();
      const id = `web:${encodeURIComponent(page.url)}:${chunkIndex}`;
      allChunks.push({
        id,
        text,
        metadata: {
          folder: "public",
          fileName: page.title,
          driveFileId: "",
          chunkIndex,
          text,
          source: "website",
          url: page.url,
          pageTitle: page.title,
        },
      });
    }
  }

  if (allChunks.length === 0) {
    console.log("Website vector sync: no content to index");
    return { pageCount: 0, chunkCount: 0 };
  }

  // Embed and upsert
  console.log(`Website vector sync: embedding ${allChunks.length} chunks from ${pages.length} pages...`);
  const texts = allChunks.map((c) => c.text);
  const vectors = await embedTexts(texts);
  console.log(`Website vector sync: got ${vectors.length} embeddings, upserting...`);

  for (let i = 0; i < allChunks.length; i += UPSERT_BATCH_SIZE) {
    const batchChunks = allChunks.slice(i, i + UPSERT_BATCH_SIZE);
    const batchVectors = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    await index.upsert(
      batchChunks.map((chunk, j) => ({
        id: chunk.id,
        vector: batchVectors[j],
        metadata: chunk.metadata,
      }))
    );
    console.log(`Website vector sync: upserted batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Website vector sync: indexed ${allChunks.length} chunks from ${pages.length} pages in ${duration}s`);
  return { pageCount: pages.length, chunkCount: allChunks.length };
}

/**
 * Query the vector store for relevant website page chunks.
 */
export async function queryWebsite(query: string, topK: number = 10): Promise<WebsiteMatch[]> {
  const index = getVectorIndex();
  if (!index) return [];

  const queryVector = await embedText(query);

  const results = await index.query<ChunkMetadata>({
    vector: queryVector,
    topK,
    filter: "source = 'website'",
    includeMetadata: true,
  });

  return results
    .filter((r) => r.metadata?.text)
    .map((result) => ({
      text: result.metadata!.text,
      url: result.metadata!.url || "",
      title: result.metadata!.pageTitle || result.metadata!.fileName,
      score: result.score,
    }));
}

// --- FAQ vector indexing ---

export interface FaqMatch {
  question: string;
  answer: string;
  url: string;
  category: string;
  score: number;
}

/**
 * Index FAQ entries into the vector store.
 * Each FAQ Q+A pair is a single chunk (they're short enough).
 */
export async function syncFaqVectorIndex(faqs: KvFaq[]): Promise<{ faqCount: number; chunkCount: number }> {
  const index = getVectorIndex();
  if (!index) {
    console.warn("Vector index not configured, skipping FAQ vector sync");
    return { faqCount: 0, chunkCount: 0 };
  }

  const startTime = Date.now();

  // Clean existing FAQ chunks
  try {
    let cursor = "0";
    const orphanIds: string[] = [];
    do {
      const page = await index.range({ cursor, limit: 100, includeMetadata: true });
      for (const vec of page.vectors) {
        if (vec.metadata?.source === "faq") {
          orphanIds.push(vec.id as string);
        }
      }
      cursor = page.nextCursor;
    } while (cursor && cursor !== "0");

    if (orphanIds.length > 0) {
      for (let i = 0; i < orphanIds.length; i += UPSERT_BATCH_SIZE) {
        await index.delete(orphanIds.slice(i, i + UPSERT_BATCH_SIZE));
      }
      console.log(`FAQ vector sync: deleted ${orphanIds.length} old chunks`);
    }
  } catch (err) {
    console.warn("FAQ vector sync: cleanup failed:", err);
  }

  // Each FAQ becomes one chunk with all language versions combined for better matching
  const allChunks: { id: string; text: string; metadata: ChunkMetadata }[] = [];

  for (const faq of faqs) {
    // Combine all language versions for embedding (improves multilingual matching)
    const parts = [faq.question, faq.answer];
    if (faq.questionNl) parts.push(faq.questionNl, faq.answerNl);
    if (faq.questionDe) parts.push(faq.questionDe, faq.answerDe);
    const combinedText = parts.filter(Boolean).join("\n");

    const id = `faq:${faq.notionPageId}`;
    allChunks.push({
      id,
      text: combinedText,
      metadata: {
        folder: "public",
        fileName: faq.question,
        driveFileId: "",
        chunkIndex: 0,
        text: combinedText,
        source: "faq",
        faqQuestion: faq.question,
        faqCategory: faq.category.join(","),
        faqAudience: faq.audience.join(","),
        url: faq.url,
      },
    });
  }

  if (allChunks.length === 0) {
    console.log("FAQ vector sync: no FAQs to index");
    return { faqCount: 0, chunkCount: 0 };
  }

  // Embed and upsert
  console.log(`FAQ vector sync: embedding ${allChunks.length} FAQs...`);
  const texts = allChunks.map((c) => c.text);
  const vectors = await embedTexts(texts);
  console.log(`FAQ vector sync: got ${vectors.length} embeddings, upserting...`);

  for (let i = 0; i < allChunks.length; i += UPSERT_BATCH_SIZE) {
    const batchChunks = allChunks.slice(i, i + UPSERT_BATCH_SIZE);
    const batchVectors = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    await index.upsert(
      batchChunks.map((chunk, j) => ({
        id: chunk.id,
        vector: batchVectors[j],
        metadata: chunk.metadata,
      }))
    );
    console.log(`FAQ vector sync: upserted batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`FAQ vector sync: indexed ${allChunks.length} FAQs in ${duration}s`);
  return { faqCount: faqs.length, chunkCount: allChunks.length };
}

/**
 * Query the vector store for relevant FAQ entries.
 */
export async function queryFaqs(query: string, topK: number = 8): Promise<FaqMatch[]> {
  const index = getVectorIndex();
  if (!index) return [];

  const queryVector = await embedText(query);

  const results = await index.query<ChunkMetadata>({
    vector: queryVector,
    topK,
    filter: "source = 'faq'",
    includeMetadata: true,
  });

  return results
    .filter((r) => r.metadata?.text)
    .map((result) => ({
      question: result.metadata!.faqQuestion || result.metadata!.fileName,
      answer: result.metadata!.text,
      url: result.metadata!.url || "",
      category: result.metadata!.faqCategory || "",
      score: result.score,
    }));
}
