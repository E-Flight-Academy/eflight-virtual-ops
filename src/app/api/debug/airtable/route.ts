import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";

const DEBUG_OVERRIDE_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "milos@eflight.nl"];

export async function GET(request: NextRequest) {
  // Admin-only endpoint
  try {
    const session = await getSession();
    const email = session?.customer?.email;
    if (!email || !DEBUG_OVERRIDE_EMAILS.includes(email.toLowerCase())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const lookupEmail = request.nextUrl.searchParams.get("email");
  if (!lookupEmail) {
    return NextResponse.json({ error: "missing ?email= param" }, { status: 400 });
  }

  const hasToken = !!process.env.AIRTABLE_TOKEN;
  const hasBase = !!process.env.AIRTABLE_BASE_ID;

  const userData = await getUserData(lookupEmail);

  return NextResponse.json({
    lookupEmail,
    env: { hasToken, hasBase, baseId: process.env.AIRTABLE_BASE_ID?.slice(0, 6) + "..." },
    result: userData,
  });
}
