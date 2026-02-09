import { Client } from "@notionhq/client";
import { getKvRoleAccess, setKvRoleAccess, type KvRoleAccessData, type KvRoleMapping } from "./kv-cache";

// L1: in-memory cache
let cachedRoleAccess: KvRoleAccessData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchRoleAccessFromNotion(): Promise<KvRoleMapping[]> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_ROLE_ACCESS_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("NOTION_API_KEY or NOTION_ROLE_ACCESS_DATABASE_ID not configured");
    return [];
  }

  const notion = new Client({ auth: apiKey });

  const response = await notion.databases.query({
    database_id: databaseId,
  });

  const mappings: KvRoleMapping[] = [];

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    const props = page.properties;
    let role = "";
    let folders: string[] = [];

    for (const [propName, propValue] of Object.entries(props)) {
      // Role is the title field
      if (propValue.type === "title" && propValue.title.length > 0) {
        role = propValue.title
          .map((t: { plain_text: string }) => t.plain_text)
          .join("")
          .trim();
      }

      // Folders is a multi-select field (case-insensitive match)
      if (propName.toLowerCase() === "folders" && propValue.type === "multi_select") {
        folders = propValue.multi_select.map((opt: { name: string }) => opt.name.toLowerCase());
      }
    }

    if (role) {
      mappings.push({ role, folders });
    }
  }

  console.log(`Role access: loaded ${mappings.length} role mappings`);
  return mappings;
}

export async function syncRoleAccess(): Promise<KvRoleMapping[]> {
  const mappings = await fetchRoleAccessFromNotion();
  const data: KvRoleAccessData = { mappings, cachedAt: Date.now() };
  cachedRoleAccess = data;
  cacheTimestamp = Date.now();
  await setKvRoleAccess(data);
  return mappings;
}

export async function getRoleAccess(): Promise<KvRoleMapping[]> {
  // L1: in-memory
  if (cachedRoleAccess && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRoleAccess.mappings;
  }

  // L2: Redis
  try {
    const kvRoleAccess = await getKvRoleAccess();
    if (kvRoleAccess && Date.now() - kvRoleAccess.cachedAt < CACHE_TTL_MS) {
      cachedRoleAccess = kvRoleAccess;
      cacheTimestamp = kvRoleAccess.cachedAt;
      return kvRoleAccess.mappings;
    }
  } catch {
    // Fall through
  }

  // L3: Fetch from Notion
  return syncRoleAccess();
}

/**
 * Get the folders a user can access based on their roles
 * @param userRoles Array of role names the user has
 * @returns Array of folder names the user can access (always includes 'public')
 */
export async function getFoldersForRoles(userRoles: string[]): Promise<string[]> {
  const mappings = await getRoleAccess();

  // Always include public
  const folders = new Set<string>(["public"]);

  // Normalize user roles to lowercase for comparison
  const normalizedUserRoles = userRoles.map(r => r.toLowerCase());

  for (const mapping of mappings) {
    // Check if user has this role (case-insensitive)
    if (normalizedUserRoles.includes(mapping.role.toLowerCase())) {
      // Special case: "*" means access to all folders
      if (mapping.folders.includes("*")) {
        return ["*"]; // Return early - user has access to everything
      }

      for (const folder of mapping.folders) {
        folders.add(folder);
      }
    }
  }

  return Array.from(folders);
}
