import { describe, it, expect } from "vitest";
import { getRichTextMd, buildFaqContext } from "@/lib/faq";
import type { KvFaq } from "@/lib/kv-cache";

// Helper to build a rich_text property
function richProp(
  segments: {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strikethrough?: boolean;
  }[]
) {
  return {
    type: "rich_text",
    rich_text: segments.map((s) => ({
      plain_text: s.text,
      annotations: {
        bold: s.bold ?? false,
        italic: s.italic ?? false,
        code: s.code ?? false,
        strikethrough: s.strikethrough ?? false,
      },
    })),
  };
}

describe("getRichTextMd", () => {
  it("returns empty string when property is missing", () => {
    expect(getRichTextMd({}, "Answer")).toBe("");
  });

  it("returns empty string when rich_text array is empty", () => {
    const props = { Answer: { type: "rich_text", rich_text: [] } };
    expect(getRichTextMd(props, "Answer")).toBe("");
  });

  it("returns plain text without annotations", () => {
    const props = { Answer: richProp([{ text: "Hello world" }]) };
    expect(getRichTextMd(props, "Answer")).toBe("Hello world");
  });

  it("wraps bold text in **", () => {
    const props = { Answer: richProp([{ text: "bold", bold: true }]) };
    expect(getRichTextMd(props, "Answer")).toBe("**bold**");
  });

  it("wraps italic text in *", () => {
    const props = { Answer: richProp([{ text: "italic", italic: true }]) };
    expect(getRichTextMd(props, "Answer")).toBe("*italic*");
  });

  it("wraps code text in backticks", () => {
    const props = { Answer: richProp([{ text: "code", code: true }]) };
    expect(getRichTextMd(props, "Answer")).toBe("`code`");
  });

  it("wraps strikethrough text in ~~", () => {
    const props = {
      Answer: richProp([{ text: "deleted", strikethrough: true }]),
    };
    expect(getRichTextMd(props, "Answer")).toBe("~~deleted~~");
  });

  it("converts bullet characters to markdown list items", () => {
    const props = {
      Answer: richProp([{ text: "• item one\n• item two" }]),
    };
    const result = getRichTextMd(props, "Answer");
    expect(result).toContain("- item one");
    expect(result).toContain("- item two");
  });

  it("collapses triple+ newlines to double newlines", () => {
    const props = {
      Answer: richProp([{ text: "a\n\n\nb" }]),
    };
    const result = getRichTextMd(props, "Answer");
    // After converting single \n -> \n\n, then collapsing 3+ -> \n\n
    expect(result).not.toContain("\n\n\n");
  });

  it("converts single newlines to double for markdown rendering", () => {
    const props = {
      Answer: richProp([{ text: "line1\nline2" }]),
    };
    const result = getRichTextMd(props, "Answer");
    expect(result).toContain("\n\n");
  });
});

function makeFaq(overrides: Partial<KvFaq> = {}): KvFaq {
  return {
    question: "What is E-Flight?",
    questionNl: "Wat is E-Flight?",
    questionDe: "Was ist E-Flight?",
    answer: "An academy",
    answerNl: "Een academie",
    answerDe: "Eine Akademie",
    category: "Training",
    audience: ["Student"],
    url: "",
    ...overrides,
  };
}

describe("buildFaqContext", () => {
  it("returns empty string for empty array", () => {
    expect(buildFaqContext([])).toBe("");
  });

  it("starts with FAQ header", () => {
    const result = buildFaqContext([makeFaq()]);
    expect(result).toContain("=== Frequently Asked Questions ===");
  });

  it("uses English Q+A by default", () => {
    const result = buildFaqContext([makeFaq()]);
    expect(result).toContain("Q: What is E-Flight?");
    expect(result).toContain("A: An academy");
  });

  it("uses Dutch Q+A when lang=nl", () => {
    const result = buildFaqContext([makeFaq()], "nl");
    expect(result).toContain("Q: Wat is E-Flight?");
    expect(result).toContain("A: Een academie");
  });

  it("uses German Q+A when lang=de", () => {
    const result = buildFaqContext([makeFaq()], "de");
    expect(result).toContain("Q: Was ist E-Flight?");
    expect(result).toContain("A: Eine Akademie");
  });

  it("falls back to English when translation is missing", () => {
    const faq = makeFaq({ questionNl: "", answerNl: "" });
    const result = buildFaqContext([faq], "nl");
    expect(result).toContain("Q: What is E-Flight?");
    expect(result).toContain("A: An academy");
  });

  it("includes URL when present", () => {
    const faq = makeFaq({ url: "https://eflight.nl/info" });
    const result = buildFaqContext([faq]);
    expect(result).toContain("Link: https://eflight.nl/info");
  });

  it("does not include Link line when url is empty", () => {
    const result = buildFaqContext([makeFaq({ url: "" })]);
    expect(result).not.toContain("Link:");
  });
});
