import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getAllCustomers } from "@/lib/airtable";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl"];

export async function GET(request: NextRequest) {
  // Admin-only
  try {
    const session = await getSession();
    const email = session?.customer?.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const customers = await getAllCustomers();
  console.log(`[debug/customers] Returning ${customers.length} customers`);
  return NextResponse.json(customers);
}
