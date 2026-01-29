import { NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents";

export const maxDuration = 120;

async function warmUp() {
  try {
    const context = await getDocumentContext();
    return NextResponse.json({
      status: "ready",
      fileCount: context.fileNames.length,
    });
  } catch (err) {
    console.error("Knowledge base warm-up failed:", err);
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
