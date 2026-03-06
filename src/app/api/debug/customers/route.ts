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

  // Direct Airtable test — bypass getAllCustomers to see raw errors
  const token = process.env.AIRTABLE_TOKEN || "";
  const baseId = process.env.AIRTABLE_BASE_ID || "";
  const fields = ["Client E-Mail", "Name", "Wings Role"].map(f => `fields%5B%5D=${encodeURIComponent(f)}`).join("&");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Customers")}?${fields}&maxRecords=5`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: "airtable_error", status: res.status, body });
    }
    const data = JSON.parse(body);
    const customers = (data.records || []).map((rec: Record<string, unknown>) => {
      const f = rec.fields as Record<string, unknown>;
      return {
        email: f["Client E-Mail"] || "",
        name: (f["Name"] as string[])?.[0] || (f["Client E-Mail"] as string || "").split("@")[0],
        roles: f["Wings Role"] || [],
      };
    });
    return NextResponse.json({ _debug: true, _total: data.records?.length, customers });
  } catch (err) {
    return NextResponse.json({ error: "fetch_error", message: err instanceof Error ? err.message : String(err) });
  }
}
