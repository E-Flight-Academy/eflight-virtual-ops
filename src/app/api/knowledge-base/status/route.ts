import { NextResponse } from "next/server";
import { getKnowledgeBaseStatus } from "@/lib/documents";
import { getKvContext, getKvGeminiUris } from "@/lib/kv-cache";

export async function GET() {
  const status = await getKnowledgeBaseStatus();

  // Debug: check if context and URIs are in Redis
  let contextSize: number | string = "missing";
  let uriCount: number | string = "missing";
  try {
    const ctx = await getKvContext();
    contextSize = ctx ? JSON.stringify(ctx).length : "null";
    const uris = await getKvGeminiUris();
    uriCount = uris ? Object.keys(uris).length : "null";
  } catch (err) {
    contextSize = `error: ${err}`;
  }

  return NextResponse.json({ ...status, _debug: { contextSize, uriCount } });
}
