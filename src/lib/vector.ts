import { Index } from "@upstash/vector";
import { embedText, embedTexts } from "./embeddings";
import { fetchAllFiles, type DriveFileContent } from "./google-drive";

// --- Types ---

interface ChunkMetadata extends Record<string, unknown> {
  folder: string;
  fileName: string;
  driveFileId: string;
  chunkIndex: number;
  text: string; // chunk content stored in metadata for retrieval
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
        metadata: { folder: folder.toLowerCase(), fileName: name, driveFileId: id, chunkIndex, text },
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
      metadata: { folder: folder.toLowerCase(), fileName: name, driveFileId: id, chunkIndex, text },
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
  let filter: string | undefined;
  if (!allowedFolders.includes("*")) {
    const normalized = allowedFolders.map((f) => f.toLowerCase());
    filter = normalized.map((f) => `folder = '${f}'`).join(" OR ");
  }

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
