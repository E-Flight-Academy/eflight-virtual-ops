import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSession } from "@/lib/shopify-auth";
import { faqAdminSchema } from "@/lib/api-schemas";
import { syncFaqs } from "@/lib/faq";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl", "milos@eflight.nl"];

function richText(content: string) {
  return { rich_text: [{ text: { content } }] };
}

// Valid Notion FAQ database property names — keep in sync with actual DB schema
export const NOTION_FAQ_PROPERTIES = [
  "Question (EN)", "Question (NL)", "Question (DE)",
  "Answer (EN)", "Answer (NL)", "Answer (DE)",
  "Category", "Role", "Live", "Link", "Website",
] as const;

// Forbidden properties that no longer exist in the Notion FAQ database
export const NOTION_FAQ_FORBIDDEN_PROPERTIES = ["Audience"] as const;

export function buildAddProperties(data: { question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string; category: string[]; url: string }) {
  return {
    "Question (EN)": { title: [{ text: { content: data.question } }] },
    "Question (NL)": richText(data.questionNl),
    "Question (DE)": richText(data.questionDe),
    "Answer (EN)": richText(data.answer),
    "Answer (NL)": richText(data.answerNl),
    "Answer (DE)": richText(data.answerDe),
    "Live": { checkbox: true },
    ...(data.category && data.category.length > 0 ? { "Category": { multi_select: data.category.map((c: string) => ({ name: c })) } } : {}),
    ...(data.url ? { "Link": { url: data.url } } : {}),
  };
}

export function buildEditProperties(data: { question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string; category: string[]; url: string }) {
  return {
    "Question (EN)": { title: [{ text: { content: data.question } }] },
    "Question (NL)": richText(data.questionNl),
    "Question (DE)": richText(data.questionDe),
    "Answer (EN)": richText(data.answer),
    "Answer (NL)": richText(data.answerNl),
    "Answer (DE)": richText(data.answerDe),
    "Category": { multi_select: (data.category && data.category.length > 0) ? data.category.map((c: string) => ({ name: c })) : [] },
    "Link": { url: data.url || null },
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.customer?.email || !ADMIN_EMAILS.includes(session.customer.email.toLowerCase())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = faqAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !databaseId) {
    return NextResponse.json({ error: "Notion not configured" }, { status: 500 });
  }

  const notion = new Client({ auth: apiKey });
  const data = parsed.data;

  try {
    if (data.action === "add") {
      const page = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: buildAddProperties(data),
      });

      await syncFaqs();

      return NextResponse.json({
        success: true,
        action: "add",
        notionPageId: page.id,
        question: data.question,
        questionNl: data.questionNl,
        questionDe: data.questionDe,
      });
    }

    if (data.action === "edit") {
      await notion.pages.update({
        page_id: data.notionPageId,
        properties: buildEditProperties(data),
      });

      await syncFaqs();

      return NextResponse.json({
        success: true,
        action: "edit",
        notionPageId: data.notionPageId,
        question: data.question,
        questionNl: data.questionNl,
        questionDe: data.questionDe,
      });
    }

    if (data.action === "delete") {
      await notion.pages.update({
        page_id: data.notionPageId,
        properties: {
          "Live": { checkbox: false },
        },
      });

      await syncFaqs();

      return NextResponse.json({
        success: true,
        action: "delete",
        notionPageId: data.notionPageId,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("FAQ admin operation failed:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
