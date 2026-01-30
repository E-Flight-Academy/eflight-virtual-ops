import { NextRequest, NextResponse } from "next/server";
import { syncConfig } from "@/lib/config";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret === secret) return true;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

async function handleSync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await syncConfig();
    return NextResponse.json({
      status: "synced",
      search_order: config.search_order,
      tone_of_voice: config.tone_of_voice,
      company_context: config.company_context.slice(0, 100) + "...",
    });
  } catch (err) {
    console.error("Config sync failed:", err);
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}
