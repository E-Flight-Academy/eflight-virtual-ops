import { NextRequest, NextResponse } from "next/server";
import { syncStarters } from "@/lib/starters";
import { syncFaqs } from "@/lib/faq";
import { getKvStatus, setKvStatus } from "@/lib/kv-cache";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;

  // Check Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  // Check ?secret=<token> query parameter
  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret === secret) return true;

  // Accept Vercel CRON_SECRET (sent automatically by Vercel cron jobs)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

async function handleSync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [starters, faqs] = await Promise.all([
      syncStarters(),
      syncFaqs(),
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
      starters: { count: starters.length, questions: starters.map((s) => s.question) },
      faqs: { count: faqs.length },
    });
  } catch (err) {
    console.error("Notion sync failed:", err);
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

// GET: for Vercel cron
export async function GET(request: NextRequest) {
  return handleSync(request);
}
