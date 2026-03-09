import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getCapabilitiesForRoles } from "@/lib/role-access";

export async function GET(request: NextRequest) {
  try {
    // Debug role override (admin-only in production)
    const DEBUG_OVERRIDE_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "milos@eflight.nl"];
    const roleOverride = request.nextUrl.searchParams.get("roleOverride");
    const userEmailOverride = request.nextUrl.searchParams.get("userEmail");

    const wantsOverride = roleOverride || userEmailOverride;
    let isDebugAllowed = process.env.NODE_ENV !== "production";
    if (!isDebugAllowed && wantsOverride) {
      try {
        const session = await getSession();
        const sessionEmail = session?.customer?.email;
        if (sessionEmail && DEBUG_OVERRIDE_EMAILS.includes(sessionEmail.toLowerCase())) {
          isDebugAllowed = true;
        }
      } catch { /* no session */ }
    }

    if (isDebugAllowed && wantsOverride) {
      let roles: string[];
      let wingsUserId: number | null = null;
      let email = "dev@eflight.nl";
      let displayName = "Dev User";

      if (userEmailOverride) {
        // Look up real user data from Airtable
        const userData = await getUserData(userEmailOverride);
        wingsUserId = userData.wingsUserId;
        email = userEmailOverride;
        displayName = userEmailOverride.split("@")[0];
        // If role override is also set, use that instead of Airtable roles
        roles = roleOverride ? roleOverride.split(",").map(r => r.trim()).filter(Boolean) : userData.roles;
      } else {
        roles = roleOverride!.split(",").map(r => r.trim()).filter(Boolean);
        wingsUserId = 1062; // Dev mock fallback
      }

      const capabilities = await getCapabilitiesForRoles(roles);
      console.log(`[DEBUG] Override: email=${email}, roles=[${roles.join(", ")}], caps=[${capabilities.join(", ")}], wingsUserId=${wingsUserId}`);
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
