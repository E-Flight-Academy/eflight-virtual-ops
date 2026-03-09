import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSession } from "@/lib/shopify-auth";
import { faqTranslateSchema } from "@/lib/api-schemas";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl", "milos@eflight.nl"];

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.customer?.email || !ADMIN_EMAILS.includes(session.customer.email.toLowerCase())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = faqTranslateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { question, answer, sourceLang } = parsed.data;
  const targetLangs = (["en", "nl", "de"] as const).filter((l) => l !== sourceLang);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API not configured" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const langNames: Record<string, string> = { en: "English", nl: "Dutch", de: "German" };

  const prompt = `You are a professional translator for an aviation flight school (E-Flight Academy).
Translate the following FAQ question and answer from ${langNames[sourceLang]} to ${targetLangs.map((l) => langNames[l]).join(" and ")}.

Keep brand names like "Steward", "E-Flight Academy", "Google Drive" unchanged.
Keep the translations natural and professional.
If the answer contains markdown formatting, preserve it.

Source question (${langNames[sourceLang]}):
${question}

Source answer (${langNames[sourceLang]}):
${answer}

Return ONLY a valid JSON object with this exact structure (no markdown fences, no explanation):
{
  ${targetLangs.map((l) => `"question_${l}": "translated question in ${langNames[l]}",\n  "answer_${l}": "translated answer in ${langNames[l]}"`).join(",\n  ")}
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const translations = JSON.parse(cleaned);

    const response: Record<string, string> = {
      [`question_${sourceLang}`]: question,
      [`answer_${sourceLang}`]: answer,
    };

    for (const lang of targetLangs) {
      response[`question_${lang}`] = translations[`question_${lang}`] || "";
      response[`answer_${lang}`] = translations[`answer_${lang}`] || "";
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("FAQ translation failed:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
