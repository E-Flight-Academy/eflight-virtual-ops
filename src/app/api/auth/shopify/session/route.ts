import { NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getUserRoles } from "@/lib/airtable";

export async function GET() {
  try {
    const session = await getSession();
    console.log("Session check:", session ? `Found session for ${session.customer.email}` : "No session");

    if (!session) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
        roles: [],
      });
    }

    // Fetch roles from Airtable
    const roles = await getUserRoles(session.customer.email);

    // Don't expose tokens to client
    return NextResponse.json({
      authenticated: true,
      customer: {
        email: session.customer.email,
        firstName: session.customer.firstName,
        lastName: session.customer.lastName,
        displayName: session.customer.displayName,
      },
      roles,
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({
      authenticated: false,
      customer: null,
      roles: [],
    });
  }
}
