import { NextRequest, NextResponse } from "next/server";

const ALLOWED_IPS = [
  "82.217.95.165",
];

export async function GET(request: NextRequest) {
  // Get client IP from various headers (Vercel/Cloudflare/etc)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  // x-forwarded-for can contain multiple IPs, take the first one
  const clientIp = forwardedFor?.split(",")[0].trim() || realIp || "";

  const isAllowed = ALLOWED_IPS.includes(clientIp);

  return NextResponse.json({
    allowed: isAllowed,
    // Only expose IP in development for debugging
    ...(process.env.NODE_ENV === "development" ? { ip: clientIp } : {})
  });
}
