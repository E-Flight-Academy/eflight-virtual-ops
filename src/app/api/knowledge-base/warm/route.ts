import { NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents";
import { getKvStatus, setKvStatus } from "@/lib/kv-cache";
import { getWebsiteContent } from "@/lib/website";
import { getConfig } from "@/lib/config";

export const maxDuration = 120;

async function warmUp() {
  // Check if another instance is already warming
  try {
    const currentStatus = await getKvStatus();
    if (
      currentStatus?.status === "loading" &&
      currentStatus.warmStartedAt &&
      Date.now() - currentStatus.warmStartedAt < 180_000 // 3 min
    ) {
      return NextResponse.json({ status: "already_warming" });
    }
  } catch {
    // Proceed anyway
  }

  // Mark as loading in KV
  try {
    await setKvStatus({
      status: "loading",
      fileCount: 0,
      fileNames: [],
      lastSynced: null,
      warmStartedAt: Date.now(),
    });
  } catch {
    // Non-fatal
  }

  try {
    const config = await getConfig().catch(() => null);
    const [context, websitePages] = await Promise.all([
      getDocumentContext(),
      getWebsiteContent(config?.website_pages).catch((err) => {
        console.warn("Website warm-up failed:", err);
        return [];
      }),
    ]);
    // getDocumentContext already writes "synced" status to KV
    return NextResponse.json({
      status: "ready",
      fileCount: context.fileNames.length,
      websitePageCount: websitePages.length,
    });
  } catch (err) {
    console.error("Knowledge base warm-up failed:", err);
    // Reset status to not_synced
    try {
      await setKvStatus({
        status: "not_synced",
        fileCount: 0,
        fileNames: [],
        lastSynced: null,
      });
    } catch {
      // Non-fatal
    }
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST: called by frontend on login
export async function POST() {
  return warmUp();
}

// GET: called by Vercel cron
export async function GET() {
  return warmUp();
}
