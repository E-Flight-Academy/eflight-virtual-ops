import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeBaseStatus, getDocumentContext } from "@/lib/documents";
import { getSession } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getFoldersForRoles, getCapabilitiesForRoles } from "@/lib/role-access";
import { getConfig } from "@/lib/config";
import { getFaqs } from "@/lib/faq";

export async function GET(request: NextRequest) {
  const status = await getKnowledgeBaseStatus();

  // Fast path: skip user-specific data unless ?user=true (used by debug bar)
  const includeUser = request.nextUrl.searchParams.get("user") === "true";
  if (!includeUser || status.status !== "synced") {
    return NextResponse.json(status);
  }

  // Load config for search_order display in debug panel
  const config = await getConfig().catch(() => null);

  // Slow path: include user session, roles, filtered files
  const DEBUG_OVERRIDE_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "milos@eflight.nl"];
  const overrideUser = request.nextUrl.searchParams.get("override_user");
  const overrideRole = request.nextUrl.searchParams.get("override_role");

  let userEmail: string | null = null;
  let userRoles: string[] = [];
  let userCapabilities: string[] = [];
  let allowedFolders: string[] = ["public"];
  let filteredFileNames: string[] = status.fileNames;
  let isOverride = false;

  try {
    const session = await Promise.race([
      getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    const sessionEmail = session?.customer?.email;
    const canOverride = sessionEmail && DEBUG_OVERRIDE_EMAILS.includes(sessionEmail.toLowerCase());

    if (canOverride && (overrideUser || overrideRole)) {
      // Debug override: impersonate another user/role
      isOverride = true;
      const overrideRoles = overrideRole ? overrideRole.split(",").filter(Boolean) : [];
      if (overrideUser) {
        userEmail = overrideUser;
        const userData = await getUserData(overrideUser);
        // If role override is also set, use that instead of Airtable roles
        userRoles = overrideRoles.length > 0 ? overrideRoles : userData.roles;
      } else if (overrideRoles.length > 0) {
        userEmail = sessionEmail;
        userRoles = overrideRoles;
      }
      allowedFolders = await getFoldersForRoles(userRoles);
      userCapabilities = await getCapabilitiesForRoles(userRoles);
    } else if (sessionEmail) {
      userEmail = sessionEmail;
      const userData = await getUserData(userEmail);
      userRoles = userData.roles;
      allowedFolders = await getFoldersForRoles(userRoles);
      userCapabilities = await getCapabilitiesForRoles(userRoles);
    }

    if (!allowedFolders.includes("*")) {
      const ctx = await getDocumentContext(allowedFolders);
      filteredFileNames = ctx.fileNames;
    }
  } catch {
    // Not logged in
  }

  // Filter FAQ count by role
  let filteredFaqCount = status.faqCount;
  try {
    const faqs = await getFaqs(true);
    const normalizedRoles = userRoles.map((r) => r.toLowerCase());
    const accessibleFaqs = faqs.filter((f) =>
      f.audience.length === 0 || f.audience.some((a) => normalizedRoles.includes(a))
    );
    filteredFaqCount = accessibleFaqs.length;
  } catch {
    // Fall back to total count
  }

  return NextResponse.json({
    ...status,
    faqCount: filteredFaqCount,
    searchOrder: config?.search_order ?? ["faq", "drive"],
    user: { email: userEmail, roles: userRoles, folders: allowedFolders, capabilities: userCapabilities, ...(isOverride ? { override: true } : {}) },
    filteredFileCount: filteredFileNames.length,
    filteredFileNames,
  });
}
