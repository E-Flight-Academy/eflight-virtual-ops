import { GoogleGenerativeAI } from "@google/generative-ai";

export async function detectLanguage(text: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "en";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  try {
    const result = await model.generateContent(
      `What is the ISO 639-1 language code of this text? Reply with ONLY the 2-letter code, nothing else.\n\n"${text.slice(0, 200)}"`
    );
    const code = result.response.text().trim().toLowerCase().slice(0, 2);
    if (/^[a-z]{2}$/.test(code)) return code;
    return "en";
  } catch {
    return "en";
  }
}
