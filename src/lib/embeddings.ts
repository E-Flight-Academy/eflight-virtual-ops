import { GoogleGenerativeAI } from "@google/generative-ai";

const EMBEDDING_MODEL = "text-embedding-004";
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
 * Embed a single text string using Google's text-embedding-004 model.
 */
export async function embedText(text: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
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
      })),
    });
    allVectors.push(...result.embeddings.map((e) => e.values));
  }

  return allVectors;
}
