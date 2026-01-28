import { GoogleAIFileManager } from "@google/generative-ai/server";
import { Part } from "@google/generative-ai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface UploadedFile {
  uri: string;
  mimeType: string;
  displayName: string;
  uploadedAt: number;
}

// Cache of uploaded files keyed by Drive file ID
const uploadedFilesCache = new Map<string, UploadedFile>();

// Gemini File API uploads expire after 48 hours; re-upload after 47 hours
const UPLOAD_MAX_AGE_MS = 47 * 60 * 60 * 1000;

function getFileManager(): GoogleAIFileManager {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleAIFileManager(process.env.GEMINI_API_KEY);
}

async function uploadToGemini(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadedFile> {
  const fileManager = getFileManager();

  // Write buffer to temp file (GoogleAIFileManager.uploadFile requires a file path)
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `gemini-upload-${Date.now()}-${fileName}`);

  try {
    fs.writeFileSync(tmpPath, buffer);

    const uploadResult = await fileManager.uploadFile(tmpPath, {
      mimeType,
      displayName: fileName,
    });

    // Wait for file to become active (needed for some file types)
    let file = uploadResult.file;
    while (file.state === "PROCESSING") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      file = await fileManager.getFile(file.name);
    }

    if (file.state === "FAILED") {
      throw new Error(`Gemini file processing failed for "${fileName}"`);
    }

    return {
      uri: file.uri,
      mimeType: file.mimeType,
      displayName: fileName,
      uploadedAt: Date.now(),
    };
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function getOrUploadFile(
  driveFileId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadedFile> {
  const cached = uploadedFilesCache.get(driveFileId);
  if (cached && Date.now() - cached.uploadedAt < UPLOAD_MAX_AGE_MS) {
    return cached;
  }

  const uploaded = await uploadToGemini(buffer, fileName, mimeType);
  uploadedFilesCache.set(driveFileId, uploaded);
  return uploaded;
}

export function buildFileParts(uploadedFiles: UploadedFile[]): Part[] {
  return uploadedFiles.map((f) => ({
    fileData: {
      fileUri: f.uri,
      mimeType: f.mimeType,
    },
  }));
}
