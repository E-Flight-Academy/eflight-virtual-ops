import { describe, it, expect } from "vitest";
import { DEFAULT_LABELS } from "@/lib/i18n/labels";

describe("DEFAULT_LABELS", () => {
  it("contains all login keys", () => {
    expect(DEFAULT_LABELS["login.subtitle"]).toBeDefined();
    expect(DEFAULT_LABELS["login.placeholder"]).toBeDefined();
    expect(DEFAULT_LABELS["login.button"]).toBeDefined();
    expect(DEFAULT_LABELS["login.error.incorrect"]).toBeDefined();
    expect(DEFAULT_LABELS["login.error.connection"]).toBeDefined();
  });

  it("contains all chat keys", () => {
    expect(DEFAULT_LABELS["chat.welcome"]).toBeDefined();
    expect(DEFAULT_LABELS["chat.welcomeSub"]).toBeDefined();
    expect(DEFAULT_LABELS["chat.placeholder"]).toBeDefined();
    expect(DEFAULT_LABELS["chat.send"]).toBeDefined();
    expect(DEFAULT_LABELS["chat.error"]).toBeDefined();
    expect(DEFAULT_LABELS["chat.timeout"]).toBeDefined();
  });

  it("contains all feedback keys", () => {
    expect(DEFAULT_LABELS["feedback.thanksUp"]).toBeDefined();
    expect(DEFAULT_LABELS["feedback.askDown"]).toBeDefined();
    expect(DEFAULT_LABELS["feedback.saved"]).toBeDefined();
    expect(DEFAULT_LABELS["feedback.followUp"]).toBeDefined();
    expect(DEFAULT_LABELS["feedback.yesPlease"]).toBeDefined();
    expect(DEFAULT_LABELS["feedback.noThanks"]).toBeDefined();
  });

  it("has no empty string values", () => {
    for (const [key, value] of Object.entries(DEFAULT_LABELS)) {
      expect(value, `${key} should not be empty`).not.toBe("");
    }
  });
});
