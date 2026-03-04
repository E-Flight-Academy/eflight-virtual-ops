import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getCapabilitiesForRoles } from "@/lib/role-access";

export async function GET(request: NextRequest) {
  try {
    // Dev-only role override (with optional user email for Airtable lookup)
    const roleOverride = request.nextUrl.searchParams.get("roleOverride");
    const userEmailOverride = request.nextUrl.searchParams.get("userEmail");
    if (process.env.NODE_ENV !== "production" && (roleOverride || userEmailOverride)) {
      let roles: string[];
      let wingsUserId: number | null = null;
      let email = "dev@eflight.nl";
      let displayName = "Dev User";

      if (userEmailOverride) {
        // Look up real user data from Airtable
        const userData = await getUserData(userEmailOverride);
        roles = userData.roles;
        wingsUserId = userData.wingsUserId;
        email = userEmailOverride;
        displayName = userEmailOverride.split("@")[0];
      } else {
        roles = roleOverride!.split(",").map(r => r.trim()).filter(Boolean);
        wingsUserId = 1062; // Dev mock fallback
      }

      const capabilities = await getCapabilitiesForRoles(roles);
      console.log(`[DEV] Override: email=${email}, roles=[${roles.join(", ")}], caps=[${capabilities.join(", ")}], wingsUserId=${wingsUserId}`);
      return NextResponse.json({
        authenticated: true,
        customer: { email, firstName: "Dev", lastName: "User", displayName },
        roles,
        capabilities,
        wingsUserId,
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
