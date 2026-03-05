import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { setKvSharedChat, type KvSharedChat } from "@/lib/kv-cache";
import { chatShareSchema } from "@/lib/api-schemas";

export async function POST(request: NextRequest) {
  try {
    const parsed = chatShareSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { messages, flowContext, lang, currentFlowStepName, flowPhase } = parsed.data;

    const id = randomBytes(6).toString("base64url");

    const data: KvSharedChat = {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      flowContext: flowContext ?? {},
      lang,
      sharedAt: Date.now(),
      currentFlowStepName: currentFlowStepName || undefined,
      flowPhase: flowPhase || undefined,
    };

    const saved = await setKvSharedChat(id, data);

    if (!saved) {
      return NextResponse.json(
        { error: "Failed to save shared chat (Redis write failed)" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Share API error:", error);
    return NextResponse.json(
      { error: "Failed to create shared chat", detail: String(error) },
      { status: 500 }
    );
  }
}
