import { Client } from "@notionhq/client";
import {
  getKvFaqs,
  setKvFaqs,
  type KvFaq,
  type KvFaqImage,
  type KvFaqsData,
} from "./kv-cache";
import { getRoleAccess } from "./role-access";
import { mirrorImage } from "./scaleway-storage";
import { logger } from "./logger";
import { pushFaqMetafields } from "./shopify-admin";

// L1: in-memory cache
let cachedFaqs: KvFaqsData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getRichText(props: Record<string, unknown>, key: string): string {
  const prop = props[key] as { type: string; rich_text: { plain_text: string }[] } | undefined;
  if (prop?.type === "rich_text" && prop.rich_text.length > 0) {
    return prop.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

export function getRichTextMd(props: Record<string, unknown>, key: string): string {
  const prop = props[key] as {
    type: string;
    rich_text: {
      plain_text: string;
      annotations: { bold: boolean; italic: boolean; strikethrough: boolean; code: boolean };
    }[];
  } | undefined;
  if (prop?.type !== "rich_text" || prop.rich_text.length === 0) return "";

  let md = prop.rich_text
    .map((t) => {
      let text = t.plain_text;
      if (t.annotations.code) text = `\`${text}\``;
      if (t.annotations.bold) {
        // Bold markers must be on the same line to render correctly
        const trailing = text.match(/(\n+)$/)?.[1] || "";
        text = `**${text.trimEnd()}**${trailing}`;
      }
      if (t.annotations.italic) text = `*${text}*`;
      if (t.annotations.strikethrough) text = `~~${text}~~`;
      return text;
    })
    .join("");

  // Convert bullet character to markdown list
  md = md.replace(/^• /gm, "- ");
  // Ensure single newlines render in markdown
  md = md.replace(/\n/g, "\n\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  return md;
}

/** Extract images from Notion page blocks and optionally mirror Notion-hosted to Scaleway */
async function extractPageImages(
  notion: InstanceType<typeof Client>,
  pageId: string,
  mirrorToS3 = true,
): Promise<KvFaqImage[]> {
  try {
    const blocks = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    const images: KvFaqImage[] = [];

    for (const block of blocks.results) {
      if (!("type" in block) || block.type !== "image") continue;
      const imgBlock = block as { id: string; type: "image"; image: { type: string; file?: { url: string }; external?: { url: string }; caption?: { plain_text: string }[] } };
      const sourceUrl = imgBlock.image.type === "file"
        ? imgBlock.image.file?.url
        : imgBlock.image.external?.url;
      if (!sourceUrl) continue;

      const caption = imgBlock.image.caption?.map((c) => c.plain_text).join("") || undefined;
      // For Notion-hosted files (temporary URLs), mirror to Scaleway if S3 configured and mirroring enabled
      // For external URLs, keep as-is (they're already permanent)
      if (imgBlock.image.type === "file") {
        if (mirrorToS3 && process.env.SCW_ACCESS_KEY) {
          const ext = sourceUrl.match(/\.(png|jpe?g|gif|webp|svg)/i)?.[1] || "png";
          const key = `faq-images/${pageId}/${block.id}.${ext}`;
          const permanentUrl = await mirrorImage(sourceUrl, key);
          if (permanentUrl) images.push({ url: permanentUrl, caption });
        }
        // Skip Notion-hosted images if no S3 or mirroring disabled — their URLs expire in ~1hr
      } else {
        images.push({ url: sourceUrl, caption });
      }
    }
    return images;
  } catch (err) {
    logger.warn("Failed to extract images for page", { pageId, error: String(err) });
    return [];
  }
}

export async function fetchFaqsFromNotion(skipImages = false): Promise<KvFaq[]> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    throw new Error("NOTION_API_KEY or NOTION_DATABASE_ID is not configured");
  }

  const notion = new Client({ auth: apiKey });

  // Paginate through all results (Notion returns max 100 per query)
  const allPages: Awaited<ReturnType<typeof notion.databases.query>>["results"] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Live",
        checkbox: { equals: true },
      },
      sorts: [{ property: "Order", direction: "ascending" }],
      start_cursor: cursor,
    });
    allPages.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // Build a lookup map from Role Access page IDs to role names
  const roleAccess = await getRoleAccess();
  const rolePageIdToName = new Map<string, string>();
  for (const mapping of roleAccess) {
    rolePageIdToName.set(mapping.notionPageId, mapping.role.toLowerCase());
  }

  const faqs: KvFaq[] = [];

  for (const page of allPages) {
    if (!("properties" in page)) continue;

    const props = page.properties as Record<string, unknown>;

    // Title property = Question (EN)
    let question = "";
    for (const value of Object.values(props)) {
      const v = value as { type: string; title: { plain_text: string }[] };
      if (v.type === "title" && v.title.length > 0) {
        question = v.title.map((t) => t.plain_text).join("");
        break;
      }
    }

    const questionNl = getRichText(props, "Question (NL)");
    const questionDe = getRichText(props, "Question (DE)");
    const answer = getRichTextMd(props, "Answer (EN)");
    const answerNl = getRichTextMd(props, "Answer (NL)");
    const answerDe = getRichTextMd(props, "Answer (DE)");

    // Category (multi_select)
    const catProp = props["Category"] as { type: string; multi_select?: { name: string }[] } | undefined;
    const category = catProp?.type === "multi_select" && catProp.multi_select
      ? catProp.multi_select.map((s) => s.name)
      : [];

    // Role (relation to Role Access database) — resolve page IDs to role names
    const roleProp = props["Role"] as { type: string; relation?: { id: string }[] } | undefined;
    const audience = roleProp?.type === "relation" && roleProp.relation
      ? roleProp.relation
          .map((r) => rolePageIdToName.get(r.id))
          .filter((name): name is string => !!name)
      : [];

    // Link (url property)
    const urlProp = props["Link"] as { type: string; url?: string | null } | undefined;
    const url = urlProp?.type === "url" && urlProp.url ? urlProp.url : "";

    // Website checkbox
    const webProp = props["Website"] as { type: string; checkbox?: boolean } | undefined;
    const website = webProp?.type === "checkbox" && webProp.checkbox === true;

    // Section Slug (rollup from Website Section relation)
    const slugProp = props["Section Slug"] as { type: string; rollup?: { array?: { rich_text?: { plain_text: string }[] }[] } } | undefined;
    const sectionSlug = slugProp?.type === "rollup" && slugProp.rollup?.array?.[0]?.rich_text
      ? slugProp.rollup.array[0].rich_text.map((t) => t.plain_text).join("")
      : "";

    // Include if at least one Q+A pair exists
    if (question && (answer || answerNl || answerDe)) {
      faqs.push({
        notionPageId: page.id, question, questionNl, questionDe,
        answer, answerNl, answerDe, category, audience, url,
        website, sectionSlug,
      });
    }
  }

  if (rolePageIdToName.size > 0) {
    const withRoles = faqs.filter((f) => f.audience.length > 0).length;
    console.log(`FAQs: ${faqs.length} total, ${withRoles} with role filter, ${faqs.length - withRoles} public`);
  }

  // Fetch images in batches of 3 (Notion rate limit: 3 req/sec)
  // External images are always included; Notion-hosted mirroring only when !skipImages
  {
    let imageCount = 0;
    for (let i = 0; i < faqs.length; i += 3) {
      const batch = faqs.slice(i, i + 3);
      const results = await Promise.all(
        batch.map((faq) => extractPageImages(notion, faq.notionPageId!, !skipImages))
      );
      for (let j = 0; j < batch.length; j++) {
        if (results[j].length > 0) {
          batch[j].images = results[j];
          imageCount += results[j].length;
        }
      }
      // Rate limit pause between batches
      if (i + 3 < faqs.length) await new Promise((r) => setTimeout(r, 1100));
    }
    if (imageCount > 0) logger.info(`FAQ sync: mirrored ${imageCount} images`);
  }

  return faqs;
}

/** Fetch FAQ section names from the FAQ Sections database in Notion */
async function fetchSectionNames(): Promise<Map<string, { nl: string; en: string; de: string }>> {
  const apiKey = process.env.NOTION_API_KEY;
  const sectionDbId = process.env.NOTION_FAQ_SECTIONS_DATABASE_ID;
  if (!apiKey || !sectionDbId) return new Map();

  const notion = new Client({ auth: apiKey });
  const resp = await notion.databases.query({ database_id: sectionDbId, page_size: 50 });
  const sections = new Map<string, { nl: string; en: string; de: string }>();

  for (const page of resp.results) {
    if (!("properties" in page)) continue;
    const props = page.properties as Record<string, unknown>;
    const slug = getRichText(props, "Slug");
    if (!slug) continue;
    const nameEn = (() => {
      for (const v of Object.values(props)) {
        const p = v as { type: string; title?: { plain_text: string }[] };
        if (p.type === "title" && p.title?.length) return p.title.map((t) => t.plain_text).join("");
      }
      return "";
    })();
    const nameNl = getRichText(props, "Name (NL)") || nameEn;
    const nameDe = getRichText(props, "Name (DE)") || nameEn;
    sections.set(slug, { nl: nameNl, en: nameEn, de: nameDe });
  }
  return sections;
}

/** Build grouped FAQ JSON for Shopify metafield (per language) */
function buildShopifyFaqJson(
  faqs: KvFaq[],
  sections: Map<string, { nl: string; en: string; de: string }>,
  lang: "nl" | "en" | "de",
): { slug: string; section: string; questions: { q: string; a: string }[] }[] {
  const websiteFaqs = faqs.filter((f) => f.website);
  const grouped = new Map<string, { section: string; questions: { q: string; a: string }[] }>();

  for (const faq of websiteFaqs) {
    const slug = faq.sectionSlug || "";
    if (!grouped.has(slug)) {
      const sectionNames = sections.get(slug);
      const sectionName = sectionNames ? sectionNames[lang] : slug;
      grouped.set(slug, { section: sectionName, questions: [] });
    }
    const q = lang === "nl" ? (faq.questionNl || faq.question)
            : lang === "de" ? (faq.questionDe || faq.question)
            : faq.question;
    const a = lang === "nl" ? (faq.answerNl || faq.answer)
            : lang === "de" ? (faq.answerDe || faq.answer)
            : faq.answer;
    if (q && a) {
      grouped.get(slug)!.questions.push({ q, a });
    }
  }

  return Array.from(grouped.entries()).map(([slug, data]) => ({
    slug,
    section: data.section,
    questions: data.questions,
  }));
}

export async function syncFaqs(options?: { skipImages?: boolean }): Promise<KvFaq[]> {
  const faqs = await fetchFaqsFromNotion(options?.skipImages);
  const data: KvFaqsData = { faqs, cachedAt: Date.now() };
  cachedFaqs = data;
  cacheTimestamp = Date.now();
  await setKvFaqs(data);

  // Push FAQ metafields to Shopify (non-fatal)
  if (process.env.SHOPIFY_ADMIN_CLIENT_ID) {
    try {
      const sections = await fetchSectionNames();
      const nl = buildShopifyFaqJson(faqs, sections, "nl");
      const en = buildShopifyFaqJson(faqs, sections, "en");
      const de = buildShopifyFaqJson(faqs, sections, "de");
      await pushFaqMetafields(nl, en, de);
    } catch (err) {
      logger.error("Failed to push FAQ metafields to Shopify", { error: String(err) });
    }
  }

  return faqs;
}

export async function getFaqs(cacheOnly = false): Promise<KvFaq[]> {
  // L1: in-memory
  if (cachedFaqs && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFaqs.faqs;
  }

  // L2: Redis
  try {
    const kvFaqs = await getKvFaqs();
    if (kvFaqs && Date.now() - kvFaqs.cachedAt < CACHE_TTL_MS) {
      cachedFaqs = kvFaqs;
      cacheTimestamp = kvFaqs.cachedAt;
      return kvFaqs.faqs;
    }
  } catch {
    // Fall through
  }

  // In cache-only mode, don't trigger a full sync (let warm-up handle it)
  if (cacheOnly) return [];

  // L3: Fetch from Notion (skip images for speed — images sync via /api/sync-faqs)
  return syncFaqs({ skipImages: true });
}

function getFaqQuestion(faq: KvFaq, lang: string): string {
  if (lang === "nl" && faq.questionNl) return faq.questionNl;
  if (lang === "de" && faq.questionDe) return faq.questionDe;
  return faq.question;
}

function getFaqAnswer(faq: KvFaq, lang: string): string {
  if (lang === "nl" && faq.answerNl) return faq.answerNl;
  if (lang === "de" && faq.answerDe) return faq.answerDe;
  return faq.answer;
}

/** Get answer text with image markdown appended */
export function getFaqAnswerWithImages(faq: KvFaq, lang: string): string {
  let answer = getFaqAnswer(faq, lang);
  if (faq.images && faq.images.length > 0) {
    const imgMd = faq.images
      .map((img) => `![${img.caption || ""}](${img.url})`)
      .join("\n\n");
    answer = answer ? `${answer}\n\n${imgMd}` : imgMd;
  }
  return answer;
}

export function buildFaqContext(faqs: KvFaq[], lang = "en"): string {
  if (faqs.length === 0) return "";
  const filtered = faqs.filter((f) => getFaqAnswer(f, lang));
  // TOON-style tabular format: minimizes repeated keys for token efficiency
  const rows = filtered.map((f) => {
    const q = getFaqQuestion(f, lang);
    // Include images as markdown directly in the answer text
    const a = getFaqAnswerWithImages(f, lang);
    const link = f.url || "";
    return `${q}\t${a}\t${link}`;
  });
  return `=== FAQ ===\nquestion\tanswer\tlink\n${rows.join("\n")}`;
}
