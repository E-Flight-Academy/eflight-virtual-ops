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
    const { rating } = await request.json();

    if (!rating || !["👍", "👎"].includes(rating)) {
      return NextResponse.json(
        { error: "Invalid rating" },
        { status: 400 }
      );
    }

    const notion = new Client({ auth: apiKey });

    await notion.pages.update({
      page_id: id,
      properties: {
        Rating: { select: { name: rating } },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Rating update error:", error);
    return NextResponse.json(
      { error: "Failed to update rating" },
      { status: 500 }
    );
  }
}
