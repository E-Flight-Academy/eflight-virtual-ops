import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getCapabilitiesForRoles } from "@/lib/role-access";

export async function GET(request: NextRequest) {
  try {
    // Dev-only role override
    const roleOverride = request.nextUrl.searchParams.get("roleOverride");
    if (process.env.NODE_ENV !== "production" && roleOverride) {
      const roles = roleOverride.split(",").map(r => r.trim()).filter(Boolean);
      const capabilities = await getCapabilitiesForRoles(roles);
      console.log(`[DEV] Role override active: [${roles.join(", ")}], capabilities: [${capabilities.join(", ")}]`);
      return NextResponse.json({
        authenticated: true,
        customer: {
          email: "dev@eflight.nl",
          firstName: "Dev",
          lastName: "User",
          displayName: "Dev User",
        },
        roles,
        capabilities,
        wingsUserId: 1062, // Dev mock: Matthijs
      });
    }

    const session = await getSession();
    console.log("Session check:", session ? `Found session for ${session.customer.email}` : "No session");

    if (!session) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
        roles: [],
        capabilities: [],
        wingsUserId: null,
      });
    }

    // Fetch roles + Wings User ID from Airtable
    const userData = await getUserData(session.customer.email);
    const capabilities = await getCapabilitiesForRoles(userData.roles);

    // Don't expose tokens to client
    return NextResponse.json({
      authenticated: true,
      customer: {
        email: session.customer.email,
        firstName: session.customer.firstName,
        lastName: session.customer.lastName,
        displayName: session.customer.displayName,
      },
      roles: userData.roles,
      capabilities,
      wingsUserId: userData.wingsUserId,
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({
      authenticated: false,
      customer: null,
      roles: [],
      capabilities: [],
      wingsUserId: null,
    });
  }
}
