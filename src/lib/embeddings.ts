import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 768;
const MAX_BATCH_SIZE = 100;

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (genAI) return genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

/**
 * Embed a single text string using Google's gemini-embedding-001 model.
 */
export async function embedText(text: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    taskType: TaskType.RETRIEVAL_QUERY,
    outputDimensionality: OUTPUT_DIMENSIONALITY,
  } as Parameters<typeof model.embedContent>[0]);
  return result.embedding.values;
}

/**
 * Embed multiple texts in batches. Returns vectors in the same order as input.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = getGenAI().getGenerativeModel({ model: EMBEDDING_MODEL });
  const allVectors: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const result = await model.batchEmbedContents({
      requests: batch.map((text) => ({
        content: { role: "user", parts: [{ text }] },
        taskType: TaskType.RETRIEVAL_DOCUMENT,
        outputDimensionality: OUTPUT_DIMENSIONALITY,
      } as Parameters<typeof model.batchEmbedContents>[0]["requests"][number])),
    });
    allVectors.push(...result.embeddings.map((e) => e.values));
  }

  return allVectors;
}
