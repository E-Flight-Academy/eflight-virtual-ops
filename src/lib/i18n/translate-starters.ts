import { GoogleGenerativeAI } from "@google/generative-ai";
import { getStarters } from "../starters";
import { getKvStarterTranslation, setKvStarterTranslation } from "../kv-cache";

// L1: in-memory cache
const starterCache = new Map<string, string[]>();

export async function getTranslatedStarters(lang: string): Promise<string[]> {
  const code = lang.toLowerCase().slice(0, 2);

  // English: return originals
  const starters = await getStarters();
  const originalQuestions = starters.map((s) => s.question);
  if (code === "en") return originalQuestions;

  // L1: memory
  const cached = starterCache.get(code);
  if (cached) return cached;

  // L2: Redis
  const kvData = await getKvStarterTranslation(code);
  if (kvData) {
    starterCache.set(code, kvData.questions);
    return kvData.questions;
  }

  // L3: Generate via Gemini
  const translated = await generateStarterTranslation(code, originalQuestions);
  starterCache.set(code, translated);

  await setKvStarterTranslation({
    lang: code,
    questions: translated,
    generatedAt: Date.now(),
  });

  return translated;
}

async function generateStarterTranslation(lang: string, questions: string[]): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return questions;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const sourceJson = JSON.stringify(questions);

  const prompt = `Translate the following starter questions from English to the language with ISO 639-1 code "${lang}".

Return ONLY a valid JSON array of strings in the same order.
Keep brand names like "E-Flight Academy", "E-Flight" unchanged.
Keep the translations concise and natural.
Do not add any explanation, markdown, or code fences — just the raw JSON array.

${sourceJson}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as string[];
    if (Array.isArray(parsed) && parsed.length === questions.length) {
      return parsed;
    }
    return questions;
  } catch (err) {
    console.error(`Failed to translate starters to ${lang}:`, err);
    return questions;
  }
}
