import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isVectorConfigured, chunkDocument } from "@/lib/vector";
import type { DriveFileContent } from "@/lib/google-drive";

function makeFile(overrides: Partial<DriveFileContent> = {}): DriveFileContent {
  return {
    id: "file-1",
    name: "test.txt",
    mimeType: "text/plain",
    content: "Hello world",
    isText: true,
    folder: "Public",
    ...overrides,
  };
}

describe("isVectorConfigured", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when both env vars are set", () => {
    process.env.UPSTASH_VECTOR_REST_URL = "https://vector.example.com";
    process.env.UPSTASH_VECTOR_REST_TOKEN = "token123";
    expect(isVectorConfigured()).toBe(true);
  });

  it("returns false when env vars are missing", () => {
    delete process.env.UPSTASH_VECTOR_REST_URL;
    delete process.env.UPSTASH_VECTOR_REST_TOKEN;
    expect(isVectorConfigured()).toBe(false);
  });
});

describe("chunkDocument", () => {
  it("returns empty array for empty content", () => {
    const file = makeFile({ content: "" });
    expect(chunkDocument(file)).toEqual([]);
  });

  it("returns empty array for whitespace-only content", () => {
    const file = makeFile({ content: "   \n\n   " });
    expect(chunkDocument(file)).toEqual([]);
  });

  it("returns single chunk for short content", () => {
    const file = makeFile({ content: "Short text" });
    const chunks = chunkDocument(file);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Short text");
  });

  it("includes correct metadata in chunks", () => {
    const file = makeFile({ id: "abc", name: "doc.txt", folder: "Student" });
    const chunks = chunkDocument(file);
    expect(chunks[0].metadata.fileName).toBe("doc.txt");
    expect(chunks[0].metadata.driveFileId).toBe("abc");
    expect(chunks[0].metadata.chunkIndex).toBe(0);
    expect(chunks[0].metadata.text).toBe("Hello world");
  });

  it("splits long content into multiple chunks", () => {
    // Create content that exceeds TARGET_CHUNK_CHARS (3200)
    const paragraph = "A".repeat(2000);
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const file = makeFile({ content });
    const chunks = chunkDocument(file);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("assigns sequential chunk indices", () => {
    const paragraph = "B".repeat(2000);
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const file = makeFile({ content });
    const chunks = chunkDocument(file);
    chunks.forEach((chunk, i) => {
      expect(chunk.metadata.chunkIndex).toBe(i);
    });
  });

  it("lowercases folder name in metadata", () => {
    const file = makeFile({ folder: "Instructor" });
    const chunks = chunkDocument(file);
    expect(chunks[0].metadata.folder).toBe("instructor");
  });
});
