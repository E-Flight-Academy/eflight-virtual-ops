import { NextRequest, NextResponse } from "next/server";

const ALLOWED_IPS = [
  "94.210.241.239",  // Zeeweg 10
  "77.63.100.95",    // Zeeweg 10 2
  "82.217.95.165",   // Zeeweg 10 3
  "81.172.250.251",  // De Zanden 167
  "127.0.0.1",       // Localhost IPv4
  "::1",             // Localhost IPv6
];

export async function GET(request: NextRequest) {
  // Get client IP from various headers (Vercel/Cloudflare/etc)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  // x-forwarded-for can contain multiple IPs, take the first one
  let clientIp = forwardedFor?.split(",")[0].trim() || realIp || "";

  // Fallback for localhost (no proxy headers)
  if (!clientIp && process.env.NODE_ENV === "development") {
    clientIp = "127.0.0.1";
  }

  const isAllowed = ALLOWED_IPS.includes(clientIp);

  return NextResponse.json({
    allowed: isAllowed,
    // Only expose IP in development for debugging
    ...(process.env.NODE_ENV === "development" ? { ip: clientIp } : {})
  });
}
