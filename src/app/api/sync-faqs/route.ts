import { NextRequest, NextResponse } from "next/server";
import { syncFaqs } from "@/lib/faq";
import { syncStarters } from "@/lib/starters";
import { getKvStatus, setKvStatus } from "@/lib/kv-cache";

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
    const [faqs, starters] = await Promise.all([
      syncFaqs(),
      syncStarters(),
    ]);

    // Update faqCount in KB status
    try {
      const currentStatus = await getKvStatus();
      if (currentStatus) {
        await setKvStatus({ ...currentStatus, faqCount: faqs.length });
      }
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      status: "synced",
      faqs: { count: faqs.length },
      starters: { count: starters.length, questions: starters.map((s) => s.question) },
    });
  } catch (err) {
    console.error("FAQ sync failed:", err);
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
