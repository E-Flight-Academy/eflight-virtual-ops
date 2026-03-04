import { NextResponse } from "next/server";
import { getKnowledgeBaseStatus, getDocumentContext } from "@/lib/documents";
import { getSession } from "@/lib/shopify-auth";
import { getUserRoles } from "@/lib/airtable";
import { getFoldersForRoles } from "@/lib/role-access";

export async function GET() {
  const status = await getKnowledgeBaseStatus();

  // If KB isn't synced yet, return early — no need for user-specific data
  if (status.status !== "synced") {
    return NextResponse.json(status);
  }

  // Get user session with a timeout to avoid blocking on slow Shopify calls
  let userEmail: string | null = null;
  let userRoles: string[] = [];
  let allowedFolders: string[] = ["public"];
  let filteredFileNames: string[] = status.fileNames;

  try {
    const session = await Promise.race([
      getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (session?.customer?.email) {
      userEmail = session.customer.email;
      userRoles = await getUserRoles(userEmail);
      allowedFolders = await getFoldersForRoles(userRoles);

      // Only call getDocumentContext for role-filtered view
      if (!allowedFolders.includes("*")) {
        const ctx = await getDocumentContext(allowedFolders);
        filteredFileNames = ctx.fileNames;
      }
    }
  } catch {
    // Not logged in — use unfiltered file list from status
  }

  return NextResponse.json({
    ...status,
    user: { email: userEmail, roles: userRoles, folders: allowedFolders },
    filteredFileCount: filteredFileNames.length,
    filteredFileNames,
  });
}
