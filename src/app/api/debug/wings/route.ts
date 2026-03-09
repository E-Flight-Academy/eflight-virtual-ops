import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shopify-auth";
import { getInstructorBookings } from "@/lib/wings";
import { getUserData } from "@/lib/airtable";
import { getCapabilitiesForRoles } from "@/lib/role-access";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "milos@eflight.nl"];

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const email = session?.customer?.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "session error" }, { status: 401 });
  }

  const targetEmail = request.nextUrl.searchParams.get("email");
  if (!targetEmail) {
    return NextResponse.json({
      error: "Pass ?email=user@example.com",
      wingsConfigured: !!(process.env.WINGS_CLIENT_SECRET && process.env.WINGS_USERNAME && process.env.WINGS_PASSWORD),
    });
  }

  try {
    const userData = await getUserData(targetEmail);
    const capabilities = await getCapabilitiesForRoles(userData.roles);

    if (!userData.wingsUserId) {
      return NextResponse.json({
        email: targetEmail,
        roles: userData.roles,
        capabilities,
        wingsUserId: null,
        error: "No wingsUserId in Airtable for this user",
      });
    }

    if (!capabilities.includes("instructor-schedule")) {
      return NextResponse.json({
        email: targetEmail,
        roles: userData.roles,
        capabilities,
        wingsUserId: userData.wingsUserId,
        error: "User does not have instructor-schedule capability",
      });
    }

    const schedule = await getInstructorBookings(userData.wingsUserId);
    return NextResponse.json({
      email: targetEmail,
      roles: userData.roles,
      capabilities,
      wingsUserId: userData.wingsUserId,
      bookingCount: schedule?.bookings.length ?? 0,
      bookings: schedule?.bookings.slice(0, 5) ?? [],
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      wingsEnv: {
        clientSecret: !!process.env.WINGS_CLIENT_SECRET,
        username: !!process.env.WINGS_USERNAME,
        password: !!process.env.WINGS_PASSWORD,
      },
    }, { status: 500 });
  }
}
