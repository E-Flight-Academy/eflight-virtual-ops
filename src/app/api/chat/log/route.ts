import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function POST(request: NextRequest) {
  try {
    // Check if this IP is blocked from logging
    const blockedIps = process.env.LOG_BLOCKED_IPS?.split(",").map((ip) => ip.trim()).filter(Boolean) || [];
    if (blockedIps.length > 0) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
      if (blockedIps.includes(clientIp)) {
        return NextResponse.json({ logId: null, skipped: true });
      }
    }

    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_CHAT_LOG_DATABASE_ID;

    if (!apiKey || !databaseId) {
      return NextResponse.json(
        { error: "Chat log database not configured" },
        { status: 500 }
      );
    }

    const { question, answer, source, lang, sessionId } = await request.json();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    const notion = new Client({ auth: apiKey });

    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Question: {
          title: [{ text: { content: question.slice(0, 2000) } }],
        },
        Answer: {
          rich_text: [{ text: { content: (answer || "").slice(0, 2000) } }],
        },
        Source: source
          ? { select: { name: source } }
          : { select: null },
        Language: lang
          ? { rich_text: [{ text: { content: lang } }] }
          : { rich_text: [] },
        "Session ID": sessionId
          ? { rich_text: [{ text: { content: sessionId } }] }
          : { rich_text: [] },
        Timestamp: {
          date: { start: new Date().toISOString() },
        },
      },
    });

    return NextResponse.json({ logId: page.id });
  } catch (error) {
    console.error("Chat log error:", error);
    return NextResponse.json(
      { error: "Failed to log chat" },
      { status: 500 }
    );
  }
}
