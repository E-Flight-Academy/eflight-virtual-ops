import { NextResponse } from "next/server";
import { getKnowledgeBaseStatus } from "@/lib/documents";
import { getKvStatus } from "@/lib/kv-cache";

export async function GET() {
  const status = await getKnowledgeBaseStatus();

  // Debug: check Redis connectivity
  const redisAvailable = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  let kvRaw: unknown = null;
  try {
    kvRaw = await getKvStatus();
  } catch (err) {
    kvRaw = { error: String(err) };
  }

  return NextResponse.json({ ...status, _debug: { redisAvailable, kvRaw } });
}
