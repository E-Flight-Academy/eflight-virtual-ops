import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = process.env.NOTION_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Notion not configured" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const { feedback } = await request.json();

    if (!feedback || typeof feedback !== "string") {
      return NextResponse.json(
        { error: "Invalid feedback" },
        { status: 400 }
      );
    }

    const notion = new Client({ auth: apiKey });

    await notion.pages.update({
      page_id: id,
      properties: {
        Feedback: {
          rich_text: [{ text: { content: feedback.slice(0, 2000) } }],
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback update error:", error);
    return NextResponse.json(
      { error: "Failed to update feedback" },
      { status: 500 }
    );
  }
}
