import { NextResponse } from "next/server";
import { clearSession } from "@/lib/shopify-auth";

export async function GET() {
  try {
    await clearSession();
    return NextResponse.redirect(`https://steward.eflight.nl`);
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.redirect(`https://steward.eflight.nl`);
  }
}

export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
