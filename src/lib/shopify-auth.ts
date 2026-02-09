import { cookies } from "next/headers";

// Shopify Customer Account API OAuth config
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CUSTOMER_CLIENT_ID || "";
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "e-flight-academy.myshopify.com";

// Endpoints (custom domain)
const CUSTOMER_ACCOUNT_DOMAIN = "account.eflight.nl";
const AUTH_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/authentication/oauth/authorize`;
const TOKEN_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/authentication/oauth/token`;
const LOGOUT_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/authentication/logout`;
const GRAPHQL_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/customer/api/2024-10/graphql`;

// Callback URL
const CALLBACK_URL = process.env.SHOPIFY_CALLBACK_URL || "https://steward.eflight.nl/api/auth/shopify/callback";

// Session cookie name
const SESSION_COOKIE = "steward_session";
const CODE_VERIFIER_COOKIE = "shopify_code_verifier";

// PKCE helpers
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // Base64url encoding
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface SessionData {
  customer: ShopifyCustomer;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

// Generate authorization URL with PKCE
export async function getAuthorizationUrl(): Promise<{ url: string; codeVerifier: string }> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: CALLBACK_URL,
    scope: "openid email customer-account-api:full",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `${AUTH_ENDPOINT}?${params.toString()}`,
    codeVerifier,
  };
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number; idToken?: string }> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: SHOPIFY_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    idToken: data.id_token,
  };
}

// Fetch customer data from Customer Account API
export async function fetchCustomerData(accessToken: string): Promise<ShopifyCustomer> {
  const query = `
    query {
      customer {
        id
        emailAddress {
          emailAddress
        }
        firstName
        lastName
        displayName
      }
    }
  `;

  console.log("Fetching customer data from:", GRAPHQL_ENDPOINT);

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch customer data: ${error}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  const customer = data.data.customer;
  return {
    id: customer.id,
    email: customer.emailAddress?.emailAddress || "",
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    displayName: customer.displayName || "",
  };
}

// Create session cookie
export async function createSession(sessionData: SessionData): Promise<void> {
  const cookieStore = await cookies();
  const sessionJson = JSON.stringify(sessionData);
  const encoded = Buffer.from(sessionJson).toString("base64");

  cookieStore.set(SESSION_COOKIE, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

// Get current session
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const decoded = Buffer.from(sessionCookie.value, "base64").toString("utf-8");
    const session = JSON.parse(decoded) as SessionData;

    // Check if session is expired
    if (session.expiresAt < Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

// Clear session
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Store code verifier temporarily
export async function storeCodeVerifier(codeVerifier: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CODE_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });
}

// Get and clear code verifier
export async function getAndClearCodeVerifier(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(CODE_VERIFIER_COOKIE);
  const value = cookie?.value || null;
  cookieStore.delete(CODE_VERIFIER_COOKIE);
  return value;
}

// Get logout URL
export function getLogoutUrl(returnUrl: string = "https://steward.eflight.nl"): string {
  const params = new URLSearchParams({
    id_token_hint: "", // We'd need to store this from login
    post_logout_redirect_uri: returnUrl,
  });
  return `${LOGOUT_ENDPOINT}?${params.toString()}`;
}
