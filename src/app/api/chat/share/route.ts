import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { setKvSharedChat, type KvSharedChat } from "@/lib/kv-cache";

export async function POST(request: NextRequest) {
  try {
    const { messages, flowContext, lang } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages to share" },
        { status: 400 }
      );
    }

    for (const msg of messages) {
      if (!msg.role || !msg.content || !["user", "assistant"].includes(msg.role)) {
        return NextResponse.json(
          { error: "Invalid message format" },
          { status: 400 }
        );
      }
    }

    const id = randomBytes(6).toString("base64url");

    const data: KvSharedChat = {
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      flowContext: flowContext && typeof flowContext === "object" ? flowContext : {},
      lang: lang || "en",
      sharedAt: Date.now(),
    };

    const saved = await setKvSharedChat(id, data);

    if (!saved) {
      return NextResponse.json(
        { error: "Failed to save shared chat" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Share API error:", error);
    return NextResponse.json(
      { error: "Failed to create shared chat" },
      { status: 500 }
    );
  }
}
