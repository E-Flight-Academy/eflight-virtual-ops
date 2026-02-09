import { NextResponse } from "next/server";
import { getAuthorizationUrl, storeCodeVerifier } from "@/lib/shopify-auth";

export async function GET() {
  try {
    const { url, codeVerifier } = await getAuthorizationUrl();

    // Store code verifier in cookie for callback
    await storeCodeVerifier(codeVerifier);

    // Redirect to Shopify login
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.redirect(
      `https://steward.eflight.nl?error=login_failed`
    );
  }
}
