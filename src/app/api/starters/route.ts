import { NextResponse } from "next/server";
import { getStarters } from "@/lib/starters";

export async function GET() {
  try {
    const starters = await getStarters();
    return NextResponse.json(starters);
  } catch (err) {
    console.error("Failed to fetch starters:", err);
    return NextResponse.json([], { status: 200 });
  }
}
