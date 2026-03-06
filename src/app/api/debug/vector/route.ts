import { NextRequest, NextResponse } from "next/server";
import { isVectorConfigured } from "@/lib/vector";
import { embedText } from "@/lib/embeddings";
import { Index } from "@upstash/vector";

export async function GET(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  const querySecret = request.nextUrl.searchParams.get("secret");
  if (!secret || querySecret !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const diagnostics: Record<string, unknown> = {};

  // Check env vars
  diagnostics.vectorConfigured = isVectorConfigured();
  diagnostics.urlSet = !!process.env.UPSTASH_VECTOR_REST_URL;
  diagnostics.tokenSet = !!process.env.UPSTASH_VECTOR_REST_TOKEN;
  diagnostics.urlPrefix = process.env.UPSTASH_VECTOR_REST_URL?.substring(0, 30);
  diagnostics.geminiKeySet = !!process.env.GEMINI_API_KEY;

  // Try creating index
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const info = await index.info();
    diagnostics.indexInfo = { dimension: info.dimension, vectorCount: info.vectorCount };
  } catch (err) {
    diagnostics.indexError = err instanceof Error ? err.message : String(err);
  }

  // Try embedding
  try {
    const vec = await embedText("test");
    diagnostics.embeddingDim = vec.length;
  } catch (err) {
    diagnostics.embeddingError = err instanceof Error ? err.message : String(err);
  }

  // Try upsert + query + delete
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const vec = await embedText("diagnostic test");
    await index.upsert([{
      id: "diag:test",
      vector: vec,
      metadata: { source: "test", text: "diagnostic" },
    }]);
    diagnostics.upsertOk = true;
    await index.delete(["diag:test"]);
    diagnostics.deleteOk = true;
  } catch (err) {
    diagnostics.upsertError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(diagnostics);
}
