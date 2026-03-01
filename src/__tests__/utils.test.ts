import { describe, it, expect } from "vitest";
import { cn, truncate, formatDate } from "@/lib/utils";

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("returns empty string when no truthy values", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("truncate", () => {
  it("returns original string when shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns original string when equal to max", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and adds ellipsis when longer than max", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a date in en-GB locale", () => {
    const date = new Date(2026, 2, 1); // 1 March 2026
    expect(formatDate(date)).toBe("1 Mar 2026");
  });

  it("accepts a custom locale", () => {
    const date = new Date(2026, 0, 15); // 15 January 2026
    const result = formatDate(date, "en-US");
    expect(result).toContain("Jan");
    expect(result).toContain("2026");
  });
});
