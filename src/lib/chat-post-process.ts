/**
 * Post-processing helpers for Gemini chat responses.
 * Extracted from the chat route for testability.
 */

export interface SimpleFaq {
  question: string;
  questionNl: string;
  questionDe: string;
  answer: string;
  answerNl: string;
  answerDe: string;
  url: string;
}

export interface WebsitePage {
  url: string;
  title: string;
  content: string;
}

export interface Product {
  title: string;
  url: string;
  tags: string[];
  minPrice: number;
  maxPrice: number;
  variants: { price: number }[];
}

export interface SourceResult {
  processedSource: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

/** Match a [source: FAQ | ...] tag and resolve the FAQ URL + title. */
export function processFaqSource(
  fullText: string,
  faqs: SimpleFaq[]
): SourceResult {
  const result: SourceResult = { processedSource: null, sourceTitle: null, sourceUrl: null };
  const faqSourceMatch = fullText.match(/\[source:\s*FAQ\s*(?:\|\s*([^\]]*))?\]/i);
  if (!faqSourceMatch || faqs.length === 0) return result;

  const faqLabel = faqSourceMatch[1]?.trim() || "";

  // Exact match by question
  let matchedFaq = faqs.find(
    (f) => f.question === faqLabel || f.questionNl === faqLabel || f.questionDe === faqLabel
  );

  // Fuzzy match
  if (!matchedFaq && faqLabel) {
    const labelLower = faqLabel.toLowerCase();
    matchedFaq = faqs.find(
      (f) =>
        f.question.toLowerCase().includes(labelLower) ||
        labelLower.includes(f.question.toLowerCase()) ||
        f.questionNl.toLowerCase().includes(labelLower) ||
        labelLower.includes(f.questionNl.toLowerCase())
    );
  }

  // Content match (last resort)
  if (!matchedFaq) {
    const responseWords = fullText
      .replace(/\[source:[^\]]*\]/gi, "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    let bestFaq: SimpleFaq | null = null;
    let bestScore = 0;
    for (const f of faqs) {
      if (!f.url) continue;
      const faqWords = new Set(
        [...f.answer.toLowerCase().split(/\s+/), ...f.question.toLowerCase().split(/\s+/)].filter(
          (w) => w.length > 4
        )
      );
      let score = 0;
      for (const w of responseWords) {
        if (faqWords.has(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestFaq = f;
      }
    }
    if (bestFaq && bestScore > 3) matchedFaq = bestFaq;
  }

  if (matchedFaq?.url) {
    result.sourceUrl = matchedFaq.url;
    result.sourceTitle = faqLabel || matchedFaq.question;
    result.processedSource = `[source: FAQ | ${matchedFaq.url} | ${result.sourceTitle}]`;
  }

  return result;
}

/** Auto-inject a [link:] card when FAQ source has URL but Gemini didn't include one. */
export function injectFaqLinkCard(
  fullText: string,
  sourceUrl: string | null,
  sourceTitle: string | null,
  isFaqSource: boolean
): { text: string; injected: boolean } {
  if (!sourceUrl || !isFaqSource || /\[link:/i.test(fullText)) {
    return { text: fullText, injected: false };
  }

  const linkLabel = sourceTitle || "More info";
  const linkTag = `\n[link: ${sourceUrl} | ${linkLabel}]`;
  const sourceTagIdx = fullText.search(/\[source:\s/i);

  if (sourceTagIdx > 0) {
    return {
      text: fullText.slice(0, sourceTagIdx) + linkTag + "\n" + fullText.slice(sourceTagIdx),
      injected: true,
    };
  }

  return { text: fullText + linkTag, injected: true };
}

/** Parse and strip [suggestions: q1 | q2] from text. */
export function parseSuggestions(fullText: string): {
  suggestions: string[];
  cleanedText: string;
} {
  const match = fullText.match(/\[suggestions:\s*([^\]]+)\]/i);
  if (!match) return { suggestions: [], cleanedText: fullText };

  const suggestions = match[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const cleanedText = fullText.replace(/\n?\[suggestions:\s*[^\]]+\]/i, "").trimEnd();
  return { suggestions, cleanedText };
}

/** Sanitize source title (strip newlines, pipes, excess whitespace). */
export function sanitizeSourceTitle(title: string): string {
  return title.replace(/[\n\r|]/g, " ").replace(/\s+/g, " ").trim();
}
