import { google } from "googleapis";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — import from lib/ directly to bypass pdf-parse's test-file loader
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export interface DriveFileContent {
  id: string;
  name: string;
  mimeType: string;
  content: string;
  buffer?: Buffer;
  isText: boolean;
  folder: string; // Top-level folder name (e.g., "public", "student", "instructor")
}

const WORKSPACE_EXPORT_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

function getDriveClient() {
  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyBase64) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
  }

  const credentials = JSON.parse(
    Buffer.from(keyBase64, "base64").toString("utf-8")
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// MIME types supported by the Gemini File API for binary upload
const SUPPORTED_BINARY_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/xml",
  "text/markdown",
  "application/rtf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

interface FileWithFolder {
  id: string;
  name: string;
  mimeType: string;
  folder: string;
}

async function listFolderFiles(folderId: string, folder: string = ""): Promise<FileWithFolder[]> {
  const drive = getDriveClient();
  const files: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 100,
      pageToken,
    });

    if (res.data.files) {
      for (const file of res.data.files) {
        if (file.id && file.name && file.mimeType) {
          files.push({ id: file.id, name: file.name, mimeType: file.mimeType });
        }
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Separate folders from files
  const folders = files.filter((f) => f.mimeType === FOLDER_MIME_TYPE);
  const nonFolders: FileWithFolder[] = files
    .filter((f) => f.mimeType !== FOLDER_MIME_TYPE)
    .map((f) => ({ ...f, folder }));

  // Recursively list files in subfolders
  // If we're at root level (folder === ""), use subfolder name as the folder tag
  // Otherwise, keep the parent folder name
  for (const subfolder of folders) {
    const subfolderTag = folder === "" ? subfolder.name.toLowerCase() : folder;
    const subFiles = await listFolderFiles(subfolder.id, subfolderTag);
    nonFolders.push(...subFiles);
  }

  return nonFolders;
}

async function exportWorkspaceFile(
  fileId: string,
  exportMimeType: string
): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.export(
    { fileId, mimeType: exportMimeType },
    { responseType: "text" }
  );
  return res.data as string;
}

async function downloadBinaryFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function fetchAllFiles(): Promise<DriveFileContent[]> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured");
  }

  const fileList = await listFolderFiles(folderId);
  const results: DriveFileContent[] = [];

  // Log folder distribution for debugging
  const folderCounts: Record<string, number> = {};
  for (const f of fileList) {
    folderCounts[f.folder || "(root)"] = (folderCounts[f.folder || "(root)"] || 0) + 1;
  }
  console.log("Drive files by folder:", folderCounts);

  for (const file of fileList) {
    try {
      const exportType = WORKSPACE_EXPORT_TYPES[file.mimeType];

      if (exportType) {
        // Google Workspace file — export as text
        const content = await exportWorkspaceFile(file.id, exportType);
        results.push({
          id: file.id,
          name: file.name,
          mimeType: exportType,
          content,
          isText: true,
          folder: file.folder,
        });
      } else if (file.mimeType === "application/pdf") {
        // PDF — download and extract text
        const buffer = await downloadBinaryFile(file.id);
        let extractedText = "";
        try {
          const parsed = await pdfParse(buffer);
          extractedText = parsed.text?.trim() ?? "";
        } catch (parseErr) {
          console.warn(`Failed to parse PDF "${file.name}":`, parseErr);
        }

        if (extractedText.length > 0) {
          // Text extracted successfully — treat as text document
          results.push({
            id: file.id,
            name: file.name,
            mimeType: "application/pdf",
            content: extractedText,
            isText: true,
            folder: file.folder,
          });
        } else {
          // No text (e.g. scanned image PDF) — keep as binary for Gemini File API
          results.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            content: "",
            buffer,
            isText: false,
            folder: file.folder,
          });
        }
      } else if (SUPPORTED_BINARY_TYPES.has(file.mimeType)) {
        // Other supported binary file — download raw bytes
        const buffer = await downloadBinaryFile(file.id);
        results.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          content: "",
          buffer,
          isText: false,
          folder: file.folder,
        });
      } else {
        console.warn(`Skipping unsupported file type "${file.name}" (${file.mimeType})`);
      }
    } catch (err) {
      console.warn(`Failed to fetch file "${file.name}" (${file.id}):`, err);
      // Skip this file and continue with the rest
    }
  }

  return results;
}
