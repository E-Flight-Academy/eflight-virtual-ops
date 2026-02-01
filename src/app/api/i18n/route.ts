import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "@/lib/i18n/translate";
import { getTranslatedStarters } from "@/lib/i18n/translate-starters";
import { DEFAULT_LABELS } from "@/lib/i18n/labels";
import { getStarters } from "@/lib/starters";

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang")?.toLowerCase().slice(0, 2) || "en";

  try {
    if (lang === "en") {
      const starters = await getStarters();
      return NextResponse.json({
        labels: DEFAULT_LABELS,
        starters: starters.map((s) => s.question),
      });
    }

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
      starters: starters.map((s: { question: string }) => s.question),
    });
  }
}
