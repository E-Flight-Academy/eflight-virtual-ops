import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "@/lib/i18n/translate";
import { getTranslatedStarters } from "@/lib/i18n/translate-starters";
import { DEFAULT_LABELS } from "@/lib/i18n/labels";
import { getStarters } from "@/lib/starters";

// Languages with native Notion translations — no Gemini needed for starters
const NATIVE_LANGS = new Set(["en", "nl", "de"]);

function getNativeQuestion(s: { question: string; questionNl: string; questionDe: string }, lang: string): string {
  if (lang === "nl" && s.questionNl) return s.questionNl;
  if (lang === "de" && s.questionDe) return s.questionDe;
  return s.question;
}

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang")?.toLowerCase().slice(0, 2) || "en";

  try {
    const starters = await getStarters();

    if (lang === "en") {
      return NextResponse.json({
        labels: DEFAULT_LABELS,
        starters: starters.map((s) => s.question),
      });
    }

    // For NL/DE: use native Notion translations for starters
    if (NATIVE_LANGS.has(lang)) {
      const labels = await getTranslations(lang);
      return NextResponse.json({
        labels,
        starters: starters.map((s) => getNativeQuestion(s, lang)),
      });
    }

    // Other languages: use Gemini translation for starters
    const [labels, starterQuestions] = await Promise.all([
      getTranslations(lang),
      getTranslatedStarters(lang),
    ]);

    return NextResponse.json({ labels, starters: starterQuestions });
  } catch (err) {
    console.error("i18n API error:", err);
    const starters = await getStarters().catch(() => []);
    return NextResponse.json({
      labels: DEFAULT_LABELS,
      starters: starters.map((s) => s.question),
    });
  }
}
