import { NextResponse } from "next/server";
import { syncStarters } from "@/lib/starters";

export async function POST() {
  try {
    const starters = await syncStarters();
    return NextResponse.json({
      status: "synced",
      count: starters.length,
      starters: starters.map((s) => s.text),
    });
  } catch (err) {
    console.error("Notion sync failed:", err);
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET: for Vercel cron
export async function GET() {
  return POST();
}
