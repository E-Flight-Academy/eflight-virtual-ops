import { NextRequest, NextResponse } from "next/server";
import { getKvSharedChat } from "@/lib/kv-cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id.length < 6 || id.length > 12) {
      return NextResponse.json(
        { error: "Invalid chat ID" },
        { status: 400 }
      );
    }

    const chat = await getKvSharedChat(id);

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(chat);
  } catch (error) {
    console.error("Share fetch error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve shared chat" },
      { status: 500 }
    );
  }
}
