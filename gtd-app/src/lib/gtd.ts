import fs from "fs/promises";
import path from "path";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GtdTask {
  text: string;
  done: boolean;
}

export interface GtdList {
  slug: string;
  title: string;
  created: string; // YYYY-MM-DD
  tasks: GtdTask[];
}

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), "data");

function filePath(slug: string) {
  return path.join(DATA_DIR, `${slug}.md`);
}

/** Turn a title into a filesystem-safe slug */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* ------------------------------------------------------------------ */
/*  Parse .md → GtdList                                                */
/* ------------------------------------------------------------------ */

function parseMarkdown(raw: string, slug: string): GtdList {
  let title = slug;
  let created = "";
  let body = raw;

  // Extract YAML frontmatter between --- markers
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const titleMatch = fm.match(/^title:\s*(.+)$/m);
    const createdMatch = fm.match(/^created:\s*(.+)$/m);
    if (titleMatch) title = titleMatch[1].trim();
    if (createdMatch) created = createdMatch[1].trim();
    body = raw.slice(fmMatch[0].length).trim();
  }

  // Parse task checkbox lines: - [ ] or - [x]
  const tasks: GtdTask[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^- \[([ xX])\] (.+)$/);
    if (m) {
      tasks.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() });
    }
  }

  return { slug, title, created, tasks };
}

/* ------------------------------------------------------------------ */
/*  Serialize GtdList → markdown                                       */
/* ------------------------------------------------------------------ */

function toMarkdown(list: GtdList): string {
  const lines: string[] = [
    "---",
    `title: ${list.title}`,
    `created: ${list.created}`,
    "---",
    "",
  ];
  for (const t of list.tasks) {
    lines.push(`- [${t.done ? "x" : " "}] ${t.text}`);
  }
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** Return all .md lists sorted newest-first */
export async function getAllLists(): Promise<GtdList[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const lists: GtdList[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const slug = f.replace(/\.md$/, "");
    const raw = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
    lists.push(parseMarkdown(raw, slug));
  }
  lists.sort((a, b) => (b.created > a.created ? 1 : -1));
  return lists;
}

/** Read one list */
export async function getList(slug: string): Promise<GtdList | null> {
  try {
    const raw = await fs.readFile(filePath(slug), "utf-8");
    return parseMarkdown(raw, slug);
  } catch {
    return null;
  }
}

/** Create a new list */
export async function createList(title: string): Promise<GtdList> {
  await ensureDir();
  const slug = slugify(title);
  const list: GtdList = {
    slug,
    title,
    created: new Date().toISOString().slice(0, 10),
    tasks: [],
  };
  await fs.writeFile(filePath(slug), toMarkdown(list), "utf-8");
  return list;
}

/** Save (overwrite) a list */
export async function saveList(list: GtdList): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath(list.slug), toMarkdown(list), "utf-8");
}

/** Delete a list file */
export async function deleteList(slug: string): Promise<boolean> {
  try {
    await fs.unlink(filePath(slug));
    return true;
  } catch {
    return false;
  }
}
