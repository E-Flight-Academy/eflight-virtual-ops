import { describe, it, expect } from "vitest";
import {
  buildAddProperties,
  buildEditProperties,
  NOTION_FAQ_PROPERTIES,
  NOTION_FAQ_FORBIDDEN_PROPERTIES,
} from "@/app/api/faq-admin/route";

const VALID_PROPS = new Set<string>(NOTION_FAQ_PROPERTIES);
const FORBIDDEN_PROPS = new Set<string>(NOTION_FAQ_FORBIDDEN_PROPERTIES);

function assertPropertiesValid(properties: Record<string, unknown>) {
  const keys = Object.keys(properties);
  for (const key of keys) {
    expect(FORBIDDEN_PROPS.has(key), `Property "${key}" is forbidden — it no longer exists in the Notion FAQ database`).toBe(false);
    expect(VALID_PROPS.has(key), `Property "${key}" is not a recognized Notion FAQ property. Valid: ${[...VALID_PROPS].join(", ")}`).toBe(true);
  }
}

const sampleData = {
  question: "What is E-Flight?",
  questionNl: "Wat is E-Flight?",
  questionDe: "Was ist E-Flight?",
  answer: "An academy",
  answerNl: "Een academie",
  answerDe: "Eine Akademie",
  category: ["Training"],
  url: "https://eflight.nl",
};

describe("faq-admin Notion properties", () => {
  describe("buildAddProperties", () => {
    it("only uses valid Notion property names", () => {
      const props = buildAddProperties(sampleData);
      assertPropertiesValid(props);
    });

    it("does not include Audience property", () => {
      const props = buildAddProperties({ ...sampleData, category: ["Training"] });
      expect(Object.keys(props)).not.toContain("Audience");
    });

    it("includes all Q+A fields", () => {
      const props = buildAddProperties(sampleData);
      expect(props).toHaveProperty("Question (EN)");
      expect(props).toHaveProperty("Question (NL)");
      expect(props).toHaveProperty("Question (DE)");
      expect(props).toHaveProperty("Answer (EN)");
      expect(props).toHaveProperty("Answer (NL)");
      expect(props).toHaveProperty("Answer (DE)");
    });

    it("sets Live to true", () => {
      const props = buildAddProperties(sampleData);
      expect(props["Live"]).toEqual({ checkbox: true });
    });

    it("includes Category when provided", () => {
      const props = buildAddProperties({ ...sampleData, category: ["Training", "Safety"] });
      expect(props["Category"]).toEqual({ multi_select: [{ name: "Training" }, { name: "Safety" }] });
    });

    it("omits Category when empty", () => {
      const props = buildAddProperties({ ...sampleData, category: [] });
      expect(props).not.toHaveProperty("Category");
    });

    it("includes Link when provided", () => {
      const props = buildAddProperties(sampleData);
      expect(props["Link"]).toEqual({ url: "https://eflight.nl" });
    });

    it("omits Link when empty", () => {
      const props = buildAddProperties({ ...sampleData, url: "" });
      expect(props).not.toHaveProperty("Link");
    });
  });

  describe("buildEditProperties", () => {
    it("only uses valid Notion property names", () => {
      const props = buildEditProperties(sampleData);
      assertPropertiesValid(props);
    });

    it("does not include Audience property", () => {
      const props = buildEditProperties(sampleData);
      expect(Object.keys(props)).not.toContain("Audience");
    });

    it("clears Category when empty", () => {
      const props = buildEditProperties({ ...sampleData, category: [] });
      expect(props["Category"]).toEqual({ multi_select: [] });
    });

    it("sets Link to null when empty", () => {
      const props = buildEditProperties({ ...sampleData, url: "" });
      expect(props["Link"]).toEqual({ url: null });
    });
  });
});
