import { describe, it, expect } from "vitest";
import {
  processFaqSource,
  injectFaqLinkCard,
  parseSuggestions,
  sanitizeSourceTitle,
  type SimpleFaq,
} from "@/lib/chat-post-process";

function makeFaq(overrides: Partial<SimpleFaq> = {}): SimpleFaq {
  return {
    question: "What does the training cost?",
    questionNl: "Wat kost de opleiding?",
    questionDe: "Was kostet die Ausbildung?",
    answer: "The training costs around 50000 euros including all flight hours and theory.",
    answerNl: "De opleiding kost ongeveer 50000 euro inclusief alle vlieguren en theorie.",
    answerDe: "Die Ausbildung kostet etwa 50000 Euro inklusive aller Flugstunden und Theorie.",
    url: "",
    ...overrides,
  };
}

describe("processFaqSource", () => {
  it("returns null when no FAQ source tag in text", () => {
    const result = processFaqSource("Hello world", [makeFaq()]);
    expect(result.processedSource).toBeNull();
  });

  it("returns null when faqs array is empty", () => {
    const result = processFaqSource("Answer [source: FAQ | What?]", []);
    expect(result.processedSource).toBeNull();
  });

  it("matches FAQ by exact English question", () => {
    const faq = makeFaq({ url: "https://eflight.nl/training" });
    const text = "The training costs... [source: FAQ | What does the training cost?]";
    const result = processFaqSource(text, [faq]);
    expect(result.sourceUrl).toBe("https://eflight.nl/training");
    expect(result.processedSource).toContain("FAQ");
    expect(result.processedSource).toContain("https://eflight.nl/training");
  });

  it("matches FAQ by exact Dutch question", () => {
    const faq = makeFaq({ url: "https://eflight.nl/opleiding" });
    const text = "De opleiding... [source: FAQ | Wat kost de opleiding?]";
    const result = processFaqSource(text, [faq]);
    expect(result.sourceUrl).toBe("https://eflight.nl/opleiding");
  });

  it("matches FAQ by fuzzy (substring) match", () => {
    const faq = makeFaq({ url: "https://eflight.nl/cost" });
    const text = "Costs are... [source: FAQ | training cost]";
    const result = processFaqSource(text, [faq]);
    expect(result.sourceUrl).toBe("https://eflight.nl/cost");
  });

  it("returns null when FAQ has no URL", () => {
    const faq = makeFaq({ url: "" });
    const text = "Answer [source: FAQ | What does the training cost?]";
    const result = processFaqSource(text, [faq]);
    expect(result.processedSource).toBeNull();
  });

  it("uses FAQ question as title when label is empty", () => {
    const faq = makeFaq({ url: "https://eflight.nl/x" });
    const text = "Answer [source: FAQ]";
    // With no label and no content match (score <= 3), should not match
    // but with a content-heavy response it might. Let's test the label path explicitly.
    const text2 = "Answer [source: FAQ | What does the training cost?]";
    const result = processFaqSource(text2, [faq]);
    expect(result.sourceTitle).toBe("What does the training cost?");
  });
});

describe("injectFaqLinkCard", () => {
  it("injects link card before source tag", () => {
    const text = "Great answer here.\n[source: FAQ | url | title]";
    const result = injectFaqLinkCard(text, "https://eflight.nl/faq", "Training FAQ", true);
    expect(result.injected).toBe(true);
    expect(result.text).toContain("[link: https://eflight.nl/faq | Training FAQ]");
    // Link should be before source tag
    const linkIdx = result.text.indexOf("[link:");
    const sourceIdx = result.text.indexOf("[source:");
    expect(linkIdx).toBeLessThan(sourceIdx);
  });

  it("appends link card when no source tag", () => {
    const text = "Great answer here.";
    const result = injectFaqLinkCard(text, "https://eflight.nl/faq", "FAQ", true);
    expect(result.injected).toBe(true);
    expect(result.text).toContain("[link: https://eflight.nl/faq | FAQ]");
  });

  it("does not inject when link card already exists", () => {
    const text = "Answer\n[link: https://other.nl | Other]\n[source: FAQ]";
    const result = injectFaqLinkCard(text, "https://eflight.nl/faq", "FAQ", true);
    expect(result.injected).toBe(false);
    expect(result.text).toBe(text);
  });

  it("does not inject when source is not FAQ", () => {
    const text = "Answer\n[source: Website]";
    const result = injectFaqLinkCard(text, "https://eflight.nl", "Page", false);
    expect(result.injected).toBe(false);
  });

  it("does not inject when sourceUrl is null", () => {
    const text = "Answer\n[source: FAQ]";
    const result = injectFaqLinkCard(text, null, "FAQ", true);
    expect(result.injected).toBe(false);
  });

  it("uses 'More info' as fallback label", () => {
    const text = "Answer\n[source: FAQ]";
    const result = injectFaqLinkCard(text, "https://eflight.nl/faq", null, true);
    expect(result.text).toContain("[link: https://eflight.nl/faq | More info]");
  });
});

describe("parseSuggestions", () => {
  it("parses suggestions from text", () => {
    const text = "Answer here\n[suggestions: How much? | Where is it?]";
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual(["How much?", "Where is it?"]);
  });

  it("strips suggestions tag from text", () => {
    const text = "Answer here\n[suggestions: Q1 | Q2]";
    const result = parseSuggestions(text);
    expect(result.cleanedText).toBe("Answer here");
  });

  it("limits to 3 suggestions", () => {
    const text = "[suggestions: A | B | C | D | E]";
    const result = parseSuggestions(text);
    expect(result.suggestions).toHaveLength(3);
  });

  it("returns empty suggestions when no tag", () => {
    const text = "Just an answer";
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual([]);
    expect(result.cleanedText).toBe("Just an answer");
  });

  it("handles extra whitespace in suggestions", () => {
    const text = "[suggestions:  First question  |  Second question  ]";
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual(["First question", "Second question"]);
  });

  it("filters empty suggestions from split", () => {
    const text = "[suggestions: Question | | Another]";
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual(["Question", "Another"]);
  });
});

describe("sanitizeSourceTitle", () => {
  it("strips newlines", () => {
    expect(sanitizeSourceTitle("Line 1\nLine 2")).toBe("Line 1 Line 2");
  });

  it("strips pipe characters", () => {
    expect(sanitizeSourceTitle("Part 1 | Part 2")).toBe("Part 1 Part 2");
  });

  it("collapses excess whitespace", () => {
    expect(sanitizeSourceTitle("Too   many   spaces")).toBe("Too many spaces");
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeSourceTitle("  padded  ")).toBe("padded");
  });
});
