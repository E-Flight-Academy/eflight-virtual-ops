import { describe, it, expect } from "vitest";
import { buildOrdersContext, getLogoutUrl } from "@/lib/shopify-auth";
import type { ShopifyOrder } from "@/lib/shopify-auth";

function makeOrder(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: "gid://shopify/Order/12345",
    name: "#1001",
    processedAt: "2024-06-15T10:00:00Z",
    financialStatus: "PAID",
    fulfillmentStatus: "FULFILLED",
    totalPrice: { amount: "299.00", currencyCode: "EUR" },
    lineItems: [
      {
        title: "Discovery Flight",
        quantity: 1,
        totalPrice: { amount: "299.00", currencyCode: "EUR" },
      },
    ],
    ...overrides,
  };
}

describe("buildOrdersContext", () => {
  it("returns empty string for empty orders array", () => {
    expect(buildOrdersContext([])).toBe("");
  });

  it("starts with order history header", () => {
    const result = buildOrdersContext([makeOrder()]);
    expect(result).toContain("=== Customer Order History ===");
  });

  it("includes order names", () => {
    const result = buildOrdersContext([makeOrder({ name: "#1042" })]);
    expect(result).toContain("Order #1042");
  });

  it("includes line item titles and quantities", () => {
    const result = buildOrdersContext([makeOrder()]);
    expect(result).toContain("Discovery Flight x1");
  });

  it("extracts numeric ID from GID for order URL", () => {
    const result = buildOrdersContext([
      makeOrder({ id: "gid://shopify/Order/98765" }),
    ]);
    expect(result).toContain("/orders/98765");
  });

  it("includes financial and fulfillment statuses", () => {
    const result = buildOrdersContext([
      makeOrder({
        financialStatus: "PENDING",
        fulfillmentStatus: "UNFULFILLED",
      }),
    ]);
    expect(result).toContain("Payment: PENDING");
    expect(result).toContain("Fulfillment: UNFULFILLED");
  });
});

describe("getLogoutUrl", () => {
  it("returns logout URL with default return URL", () => {
    const url = getLogoutUrl();
    expect(url).toContain("account.eflight.nl/authentication/logout");
    expect(url).toContain("post_logout_redirect_uri=https%3A%2F%2Fsteward.eflight.nl");
  });

  it("returns logout URL with custom return URL", () => {
    const url = getLogoutUrl("https://example.com");
    expect(url).toContain("post_logout_redirect_uri=https%3A%2F%2Fexample.com");
  });
});
