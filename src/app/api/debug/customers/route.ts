import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getAllCustomers } from "@/lib/airtable";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl"];

export async function GET(request: NextRequest) {
  // Admin-only
  let sessionEmail: string | undefined;
  try {
    const session = await getSession();
    sessionEmail = session?.customer?.email?.toLowerCase();
    if (!sessionEmail || !ADMIN_EMAILS.includes(sessionEmail)) {
      console.log(`[debug/customers] Unauthorized: session email=${sessionEmail || "none"}`);
      return NextResponse.json({ error: `unauthorized (${sessionEmail || "no session"})` }, { status: 401 });
    }
  } catch (err) {
    console.log(`[debug/customers] Session error:`, err);
    return NextResponse.json({ error: "session error" }, { status: 401 });
  }

  console.log(`[debug/customers] Authorized as ${sessionEmail}, fetching customers...`);
  const customers = await getAllCustomers();
  console.log(`[debug/customers] Returning ${customers.length} customers`);

  // Temporary debug: include metadata in response
  if (customers.length === 0) {
    return NextResponse.json({
      _debug: true,
      _airtableToken: !!process.env.AIRTABLE_TOKEN,
      _airtableBase: !!process.env.AIRTABLE_BASE_ID,
      _basePrefix: process.env.AIRTABLE_BASE_ID?.slice(0, 6),
      customers,
    });
  }
  return NextResponse.json(customers);
}
