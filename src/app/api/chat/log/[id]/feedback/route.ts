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
    const { feedback, contact } = await request.json();

    if (!feedback && !contact) {
      return NextResponse.json(
        { error: "Invalid request: provide feedback or contact" },
        { status: 400 }
      );
    }

    const notion = new Client({ auth: apiKey });

    // Build update properties dynamically
    const properties: Record<string, { rich_text: { text: { content: string } }[] }> = {};
    if (feedback && typeof feedback === "string") {
      properties.Feedback = {
        rich_text: [{ text: { content: feedback.slice(0, 2000) } }],
      };
    }
    if (contact && typeof contact === "string") {
      properties.Contact = {
        rich_text: [{ text: { content: contact.slice(0, 500) } }],
      };
    }

    await notion.pages.update({
      page_id: id,
      properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
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
