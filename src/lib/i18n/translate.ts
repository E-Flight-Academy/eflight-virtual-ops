import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_LABELS, type UiLabels } from "./labels";
import { getKvTranslation, setKvTranslation } from "../kv-cache";

// L1: in-memory cache
const translationCache = new Map<string, UiLabels>();
translationCache.set("en", DEFAULT_LABELS);

export async function getTranslations(lang: string): Promise<UiLabels> {
  const code = lang.toLowerCase().slice(0, 2);
  if (code === "en") return DEFAULT_LABELS;

  // L1
  const cached = translationCache.get(code);
  if (cached) return cached;

  // L2: Redis
  const kvData = await getKvTranslation(code);
  if (kvData) {
    const labels = { ...DEFAULT_LABELS, ...kvData.labels } as UiLabels;
    translationCache.set(code, labels);
    return labels;
  }

  // L3: Generate via Gemini
  const labels = await generateTranslation(code);
  translationCache.set(code, labels);

  await setKvTranslation({
    lang: code,
    labels: labels as unknown as Record<string, string>,
    generatedAt: Date.now(),
  });

  return labels;
}

async function generateTranslation(lang: string): Promise<UiLabels> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return DEFAULT_LABELS;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const sourceJson = JSON.stringify(DEFAULT_LABELS, null, 2);

  const prompt = `Translate the following UI labels from English to the language with ISO 639-1 code "${lang}".

Return ONLY a valid JSON object with the same keys and translated values.
Keep brand names like "E-Flight Virtual Ops", "E-Flight Academy", "Google Drive", "FAQs" unchanged.
Keep the translations concise and natural for a UI context.
Do not add any explanation, markdown, or code fences — just the raw JSON object.

${sourceJson}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, string>;
    return { ...DEFAULT_LABELS, ...parsed } as UiLabels;
  } catch (err) {
    console.error(`Failed to generate ${lang} translation:`, err);
    return DEFAULT_LABELS;
  }
}
