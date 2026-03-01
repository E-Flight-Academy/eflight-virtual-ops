import { describe, it, expect } from "vitest";
import { buildWebsiteContext } from "@/lib/website";
import type { KvWebsitePage } from "@/lib/kv-cache";

function makePage(overrides: Partial<KvWebsitePage> = {}): KvWebsitePage {
  return {
    url: "https://www.eflight.nl/about",
    title: "About E-Flight",
    content: "E-Flight Academy is a flight training school.",
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe("buildWebsiteContext", () => {
  it("returns empty string for empty pages array", () => {
    expect(buildWebsiteContext([])).toBe("");
  });

  it("starts with website content header", () => {
    const result = buildWebsiteContext([makePage()]);
    expect(result).toContain("=== Website Content (www.eflight.nl) ===");
  });

  it("includes page titles and URLs", () => {
    const result = buildWebsiteContext([makePage()]);
    expect(result).toContain("--- About E-Flight (https://www.eflight.nl/about) ---");
  });

  it("includes page content", () => {
    const result = buildWebsiteContext([makePage()]);
    expect(result).toContain("E-Flight Academy is a flight training school.");
  });
});
