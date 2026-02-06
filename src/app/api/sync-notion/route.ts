import { NextRequest, NextResponse } from "next/server";
import { syncStarters } from "@/lib/starters";
import { syncFaqs } from "@/lib/faq";
import { syncWebsite } from "@/lib/website";
import { syncFlows } from "@/lib/guided-flows";
import { syncProducts } from "@/lib/shopify";
import { getConfig } from "@/lib/config";
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
    const config = await getConfig().catch(() => null);
    const [starters, faqs, websitePages, flowSteps, products] = await Promise.all([
      syncStarters(),
      syncFaqs(),
      syncWebsite(config?.website_pages).catch((err) => {
        console.warn("Website sync failed:", err);
        return [];
      }),
      syncFlows().catch((err) => {
        console.warn("Flows sync failed:", err);
        return [];
      }),
      syncProducts().catch((err) => {
        console.warn("Shopify sync failed:", err);
        return [];
      }),
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
      website: { count: websitePages.length, urls: websitePages.map((p) => p.url) },
      flows: { count: flowSteps.length, names: flowSteps.map((s) => s.name) },
      products: { count: products.length, titles: products.map((p) => p.title) },
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
