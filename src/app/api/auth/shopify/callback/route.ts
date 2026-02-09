import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchCustomerData,
  createSession,
  getAndClearCodeVerifier,
} from "@/lib/shopify-auth";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return NextResponse.redirect(
        `https://steward.eflight.nl?error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `https://steward.eflight.nl?error=no_code`
      );
    }

    // Get code verifier from cookie
    const codeVerifier = await getAndClearCodeVerifier();
    if (!codeVerifier) {
      return NextResponse.redirect(
        `https://steward.eflight.nl?error=no_code_verifier`
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier);

    // Fetch customer data
    const customer = await fetchCustomerData(tokens.accessToken);

    // Create session
    await createSession({
      customer,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    });

    // Redirect back to app
    return NextResponse.redirect(`https://steward.eflight.nl?login=success`);
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.redirect(
      `https://steward.eflight.nl?error=callback_failed`
    );
  }
}
