import { NextResponse } from "next/server";
import { getKnowledgeBaseStatus, getDocumentContext } from "@/lib/documents";
import { getSession } from "@/lib/shopify-auth";
import { getUserRoles } from "@/lib/airtable";
import { getFoldersForRoles } from "@/lib/role-access";

export async function GET() {
  const status = await getKnowledgeBaseStatus();

  // Get user-specific filtered view
  let userEmail: string | null = null;
  let userRoles: string[] = [];
  let allowedFolders: string[] = ["public"];

  try {
    const session = await getSession();
    if (session?.customer?.email) {
      userEmail = session.customer.email;
      userRoles = await getUserRoles(session.customer.email);
    }
  } catch {
    // Not logged in
  }

  allowedFolders = await getFoldersForRoles(userRoles);

  // Get filtered document context to show what this user actually sees
  let filteredFileNames: string[] = [];
  try {
    const ctx = await getDocumentContext(allowedFolders);
    filteredFileNames = ctx.fileNames;
  } catch {
    // Non-fatal
  }

  return NextResponse.json({
    ...status,
    user: {
      email: userEmail,
      roles: userRoles,
      folders: allowedFolders,
    },
    filteredFileCount: filteredFileNames.length,
    filteredFileNames,
  });
}
