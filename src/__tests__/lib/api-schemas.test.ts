import { describe, it, expect } from "vitest";
import {
  chatRequestSchema,
  chatLogSchema,
  chatShareSchema,
  feedbackSchema,
  ratingSchema,
  faqTranslateSchema,
  faqAdminSchema,
  faqAdminAddSchema,
  faqAdminEditSchema,
  faqAdminDeleteSchema,
} from "@/lib/api-schemas";

describe("chatRequestSchema", () => {
  it("accepts valid request with messages", () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts request with lang and flowContext", () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: "user", content: "Hello" }],
      lang: "nl",
      flowContext: { interest: "training" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty messages array", () => {
    const result = chatRequestSchema.safeParse({ messages: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: "system", content: "Hello" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects lang longer than 5 chars", () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: "user", content: "Hi" }],
      lang: "toolong",
    });
    expect(result.success).toBe(false);
  });
});

describe("chatLogSchema", () => {
  it("accepts valid log entry", () => {
    const result = chatLogSchema.safeParse({ question: "What?" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.answer).toBe("");
    }
  });

  it("rejects empty question", () => {
    const result = chatLogSchema.safeParse({ question: "" });
    expect(result.success).toBe(false);
  });

  it("rejects question over 2000 chars", () => {
    const result = chatLogSchema.safeParse({ question: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields", () => {
    const result = chatLogSchema.safeParse({
      question: "Q",
      answer: "A",
      source: "FAQ",
      lang: "en",
      sessionId: "abc",
      email: "test@test.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("chatShareSchema", () => {
  it("accepts valid share data with defaults", () => {
    const result = chatShareSchema.safeParse({
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lang).toBe("en");
    }
  });

  it("rejects empty messages", () => {
    const result = chatShareSchema.safeParse({ messages: [] });
    expect(result.success).toBe(false);
  });
});

describe("feedbackSchema", () => {
  it("accepts feedback only", () => {
    const result = feedbackSchema.safeParse({ feedback: "Great!" });
    expect(result.success).toBe(true);
  });

  it("accepts contact only", () => {
    const result = feedbackSchema.safeParse({ contact: "me@test.com" });
    expect(result.success).toBe(true);
  });

  it("accepts both feedback and contact", () => {
    const result = feedbackSchema.safeParse({ feedback: "Nice", contact: "me@t.com" });
    expect(result.success).toBe(true);
  });

  it("rejects when both are empty/missing", () => {
    const result = feedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("ratingSchema", () => {
  it("accepts thumbs up", () => {
    expect(ratingSchema.safeParse({ rating: "👍" }).success).toBe(true);
  });

  it("accepts thumbs down", () => {
    expect(ratingSchema.safeParse({ rating: "👎" }).success).toBe(true);
  });

  it("rejects other emojis", () => {
    expect(ratingSchema.safeParse({ rating: "😀" }).success).toBe(false);
  });
});

describe("faqTranslateSchema", () => {
  it("accepts valid translation request", () => {
    const result = faqTranslateSchema.safeParse({
      question: "What is E-Flight?",
      answer: "An academy",
      sourceLang: "en",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all three source languages", () => {
    for (const lang of ["en", "nl", "de"]) {
      expect(
        faqTranslateSchema.safeParse({ question: "Q", answer: "A", sourceLang: lang }).success
      ).toBe(true);
    }
  });

  it("rejects invalid source language", () => {
    const result = faqTranslateSchema.safeParse({
      question: "Q",
      answer: "A",
      sourceLang: "fr",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty question", () => {
    const result = faqTranslateSchema.safeParse({
      question: "",
      answer: "A",
      sourceLang: "en",
    });
    expect(result.success).toBe(false);
  });
});

describe("faqAdminSchema (discriminated union)", () => {
  it("accepts a valid add action", () => {
    const result = faqAdminSchema.safeParse({
      action: "add",
      question: "What?",
      answer: "That.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe("add");
    }
  });

  it("applies defaults for optional add fields", () => {
    const result = faqAdminAddSchema.safeParse({
      action: "add",
      question: "Q",
      answer: "A",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionNl).toBe("");
      expect(result.data.category).toEqual([]);
      expect(result.data.audience).toEqual([]);
      expect(result.data.url).toBe("");
    }
  });

  it("accepts add with category and audience arrays", () => {
    const result = faqAdminAddSchema.safeParse({
      action: "add",
      question: "Q",
      answer: "A",
      category: ["Training", "Aircraft"],
      audience: ["Student"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toEqual(["Training", "Aircraft"]);
      expect(result.data.audience).toEqual(["Student"]);
    }
  });

  it("accepts a valid edit action with notionPageId", () => {
    const result = faqAdminSchema.safeParse({
      action: "edit",
      notionPageId: "abc-123",
      question: "Updated?",
      answer: "Yes.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects edit without notionPageId", () => {
    const result = faqAdminSchema.safeParse({
      action: "edit",
      question: "Q",
      answer: "A",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid delete action", () => {
    const result = faqAdminSchema.safeParse({
      action: "delete",
      notionPageId: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects delete without notionPageId", () => {
    const result = faqAdminSchema.safeParse({ action: "delete" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown action", () => {
    const result = faqAdminSchema.safeParse({ action: "archive" });
    expect(result.success).toBe(false);
  });
});
