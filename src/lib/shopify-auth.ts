import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { Redis } from "@upstash/redis";

// Shopify Customer Account API OAuth config
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CUSTOMER_CLIENT_ID || "";
// Endpoints (custom domain)
const CUSTOMER_ACCOUNT_DOMAIN = "account.eflight.nl";
const AUTH_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/authentication/oauth/authorize`;
const TOKEN_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/authentication/oauth/token`;
const LOGOUT_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/authentication/logout`;
const GRAPHQL_ENDPOINT = `https://${CUSTOMER_ACCOUNT_DOMAIN}/customer/api/2025-01/graphql`;

// Callback URL
const CALLBACK_URL = process.env.SHOPIFY_CALLBACK_URL || "https://steward.eflight.nl/api/auth/shopify/callback";

// Session cookie name — now only stores a session ID (~80 bytes)
const SESSION_COOKIE = "steward_session";
const CODE_VERIFIER_COOKIE = "shopify_code_verifier";

// Redis session key prefix + TTL
const SESSION_KEY_PREFIX = "session:";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

// HMAC signing for session ID cookie
function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.GEMINI_API_KEY || "steward-fallback-secret";
}

function signSession(payload: string): string {
  const sig = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySession(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return payload;
    }
  } catch { /* length mismatch */ }
  return null;
}

// Lazy Redis client (same pattern as kv-cache)
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

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
      "User-Agent": "EFlightSteward/1.0",
      "Accept": "application/json",
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

// Create session: store data in Redis, put only session ID in cookie
export async function createSession(sessionData: SessionData): Promise<void> {
  const sessionId = randomUUID();
  const redis = getRedis();

  // Store full session data in Redis
  await redis.set(`${SESSION_KEY_PREFIX}${sessionId}`, JSON.stringify(sessionData), { ex: SESSION_TTL });

  // Cookie only contains the signed session ID (~80 bytes total)
  const cookieStore = await cookies();
  const signed = signSession(sessionId);

  cookieStore.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

// Get current session: read session ID from cookie, fetch data from Redis
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    // Verify HMAC signature and extract session ID
    const sessionId = verifySession(sessionCookie.value);
    if (!sessionId) {
      // Legacy: try parsing as base64-encoded session data (old format)
      return parseLegacySession(sessionCookie.value);
    }

    // Fetch session data from Redis
    const redis = getRedis();
    const raw = await redis.get(`${SESSION_KEY_PREFIX}${sessionId}`);
    if (!raw) return null;

    const session = (typeof raw === "string" ? JSON.parse(raw) : raw) as SessionData;

    if (session.expiresAt < Date.now()) {
      // Clean up expired session
      await redis.del(`${SESSION_KEY_PREFIX}${sessionId}`);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

// Parse old-format cookies (base64-encoded JSON) for backwards compatibility
function parseLegacySession(cookieValue: string): SessionData | null {
  try {
    // Old format: base64(JSON).hmac or plain base64(JSON)
    const verified = verifySession(cookieValue);
    const encoded = verified ?? cookieValue;
    if (!verified && cookieValue.includes(".")) return null;

    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const session = JSON.parse(decoded) as SessionData;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

// Clear session: delete from Redis and remove cookie
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  if (sessionCookie?.value) {
    const sessionId = verifySession(sessionCookie.value);
    if (sessionId) {
      try {
        const redis = getRedis();
        await redis.del(`${SESSION_KEY_PREFIX}${sessionId}`);
      } catch { /* redis cleanup is best-effort */ }
    }
  }

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

// Fetch customer orders from Customer Account API
export interface ShopifyOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  totalPrice: { amount: string; currencyCode: string };
  lineItems: {
    title: string;
    quantity: number;
    totalPrice: { amount: string; currencyCode: string };
  }[];
}

export async function fetchCustomerOrders(accessToken: string): Promise<ShopifyOrder[]> {
  const gwUrl = process.env.GATEWAY_URL;
  const gwKey = process.env.GATEWAY_API_KEY;

  // Gateway route
  if (gwUrl && gwKey) {
    console.log("[Shopify/Gateway] Fetching orders");
    const res = await fetch(`${gwUrl}/api/shopify/orders`, {
      headers: {
        Authorization: `Bearer ${gwKey}`,
        "X-Shopify-Access-Token": accessToken,
      },
    });
    if (!res.ok) {
      throw new Error(`Gateway orders fetch failed: ${res.status}`);
    }
    const data = await res.json();
    return data.orders;
  }

  // Direct fallback
  console.log("[Shopify/Direct] Fetching orders");
  const query = `
    query {
      customer {
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              name
              processedAt
              financialStatus
              fulfillmentStatus
              totalPrice { amount currencyCode }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    quantity
                    totalPrice { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.data?.customer?.orders?.edges || []).map(({ node }: any) => ({
    id: node.id,
    name: node.name,
    processedAt: node.processedAt,
    financialStatus: node.financialStatus,
    fulfillmentStatus: node.fulfillmentStatus,
    totalPrice: node.totalPrice,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineItems: (node.lineItems?.edges || []).map(({ node: li }: any) => ({
      title: li.title,
      quantity: li.quantity,
      totalPrice: li.totalPrice,
    })),
  }));
}

export function buildOrdersContext(orders: ShopifyOrder[]): string {
  if (orders.length === 0) return "";

  const entries = orders.map((o) => {
    const date = new Date(o.processedAt).toLocaleDateString("en-GB");
    const items = o.lineItems
      .map((li) => `${li.title} x${li.quantity} (${li.totalPrice.currencyCode} ${parseFloat(li.totalPrice.amount).toFixed(2)})`)
      .join(", ");
    // Extract numeric ID from GID (gid://shopify/Order/12345)
    const numericId = o.id.split("/").pop() || "";
    const orderUrl = `https://${CUSTOMER_ACCOUNT_DOMAIN}/orders/${numericId}`;
    return `- Order ${o.name} (${date}): ${items} | Total: ${o.totalPrice.currencyCode} ${parseFloat(o.totalPrice.amount).toFixed(2)} | Payment: ${o.financialStatus} | Fulfillment: ${o.fulfillmentStatus} | Link: ${orderUrl}`;
  }).join("\n");

  return `=== Customer Order History ===\nThe following are the logged-in customer's orders from the E-Flight Academy shop. Use this to answer questions about their purchases, order status, and training packages. When mentioning an order, include a clickable markdown link to the order detail page.\n${entries}`;
}

// Get logout URL
export function getLogoutUrl(returnUrl: string = "https://steward.eflight.nl"): string {
  const params = new URLSearchParams({
    id_token_hint: "", // We'd need to store this from login
    post_logout_redirect_uri: returnUrl,
  });
  return `${LOGOUT_ENDPOINT}?${params.toString()}`;
}
