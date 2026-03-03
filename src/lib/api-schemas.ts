import { z } from "zod";

export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1),
  lang: z.string().max(5).optional(),
  flowContext: z.record(z.string(), z.string()).optional(),
});

export const chatLogSchema = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().max(2000).optional().default(""),
  source: z.string().max(100).optional(),
  lang: z.string().max(5).optional(),
  sessionId: z.string().max(100).optional(),
  email: z.string().max(200).optional(),
});

export const chatShareSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1),
  flowContext: z.record(z.string(), z.string()).optional(),
  lang: z.string().max(5).optional().default("en"),
  currentFlowStepName: z.string().optional(),
  flowPhase: z.string().optional(),
});

export const feedbackSchema = z.object({
  feedback: z.string().max(2000).optional(),
  contact: z.string().max(500).optional(),
}).refine((d) => d.feedback || d.contact, {
  message: "Provide feedback or contact",
});

export const ratingSchema = z.object({
  rating: z.enum(["👍", "👎"]),
});

export const faqTranslateSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
  sourceLang: z.enum(["en", "nl", "de"]),
});

export const faqAdminAddSchema = z.object({
  action: z.literal("add"),
  question: z.string().min(1).max(1000),
  questionNl: z.string().max(1000).optional().default(""),
  questionDe: z.string().max(1000).optional().default(""),
  answer: z.string().min(1).max(5000),
  answerNl: z.string().max(5000).optional().default(""),
  answerDe: z.string().max(5000).optional().default(""),
  category: z.string().max(100).optional().default(""),
  audience: z.array(z.string().max(100)).optional().default([]),
  url: z.string().max(500).optional().default(""),
});

export const faqAdminEditSchema = z.object({
  action: z.literal("edit"),
  notionPageId: z.string().min(1),
  question: z.string().min(1).max(1000),
  questionNl: z.string().max(1000).optional().default(""),
  questionDe: z.string().max(1000).optional().default(""),
  answer: z.string().min(1).max(5000),
  answerNl: z.string().max(5000).optional().default(""),
  answerDe: z.string().max(5000).optional().default(""),
  category: z.string().max(100).optional().default(""),
  audience: z.array(z.string().max(100)).optional().default([]),
  url: z.string().max(500).optional().default(""),
});

export const faqAdminDeleteSchema = z.object({
  action: z.literal("delete"),
  notionPageId: z.string().min(1),
});

export const faqAdminSchema = z.discriminatedUnion("action", [
  faqAdminAddSchema,
  faqAdminEditSchema,
  faqAdminDeleteSchema,
]);
