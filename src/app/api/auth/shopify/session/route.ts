import { NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
      });
    }

    // Don't expose tokens to client
    return NextResponse.json({
      authenticated: true,
      customer: {
        email: session.customer.email,
        firstName: session.customer.firstName,
        lastName: session.customer.lastName,
        displayName: session.customer.displayName,
      },
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({
      authenticated: false,
      customer: null,
    });
  }
}
