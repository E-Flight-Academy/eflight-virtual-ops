import { google } from "googleapis";

export interface DriveFileContent {
  id: string;
  name: string;
  mimeType: string;
  content: string;
  buffer?: Buffer;
  isText: boolean;
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

async function listFolderFiles(folderId: string): Promise<{ id: string; name: string; mimeType: string }[]> {
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

  // Recursively list files in subfolders
  const folders = files.filter((f) => f.mimeType === FOLDER_MIME_TYPE);
  const nonFolders = files.filter((f) => f.mimeType !== FOLDER_MIME_TYPE);

  for (const folder of folders) {
    const subFiles = await listFolderFiles(folder.id);
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
        });
      } else if (SUPPORTED_BINARY_TYPES.has(file.mimeType)) {
        // Supported binary file — download raw bytes
        const buffer = await downloadBinaryFile(file.id);
        results.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          content: "",
          buffer,
          isText: false,
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
