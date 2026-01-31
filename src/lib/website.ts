import * as cheerio from "cheerio";
import {
  getKvWebsite,
  setKvWebsite,
  type KvWebsitePage,
  type KvWebsiteData,
} from "./kv-cache";

// --- Constants ---
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PAGES = 20;
const MAX_CHARS_PER_PAGE = 8000;
const MAX_TOTAL_CHARS = 40000;
const FETCH_TIMEOUT_MS = 10000; // 10s per page

const DEFAULT_PAGES = [
  "https://e-flight.nl",
];

// --- L1: in-memory cache ---
let cachedWebsite: KvWebsiteData | null = null;
let cacheTimestamp = 0;

async function doFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EFlightVirtualOps/1.0 (internal knowledge base)",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url: string): Promise<KvWebsitePage | null> {
  try {
    let response: Response;
    try {
      response = await doFetch(url);
    } catch {
      // HTTPS may fail due to invalid SSL cert — retry with HTTP
      if (url.startsWith("https://")) {
        const httpUrl = url.replace("https://", "http://");
        console.warn(`HTTPS failed for ${url}, retrying with HTTP`);
        response = await doFetch(httpUrl);
      } else {
        throw new Error(`Fetch failed for ${url}`);
      }
    }

    if (!response.ok) {
      console.warn(`Website fetch failed for ${url}: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $("script, style, nav, footer, header, iframe, noscript, svg").remove();

    // Extract title
    const title = $("title").text().trim() || url;

    // Prefer <main> content, fall back to <body>
    let textContent = $("main").text();
    if (!textContent.trim()) {
      textContent = $("body").text();
    }

    // Collapse whitespace and truncate
    const cleaned = textContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CHARS_PER_PAGE);

    if (!cleaned) return null;

    return { url, title, content: cleaned, fetchedAt: Date.now() };
  } catch (err) {
    console.warn(`Website fetch error for ${url}:`, err);
    return null;
  }
}

async function fetchWebsitePages(urls: string[]): Promise<KvWebsitePage[]> {
  const limitedUrls = urls.slice(0, MAX_PAGES);
  const results = await Promise.allSettled(limitedUrls.map(fetchPage));

  const pages: KvWebsitePage[] = [];
  let totalChars = 0;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      if (totalChars + result.value.content.length > MAX_TOTAL_CHARS) break;
      pages.push(result.value);
      totalChars += result.value.content.length;
    }
  }

  return pages;
}

export async function syncWebsite(urls?: string[]): Promise<KvWebsitePage[]> {
  const pageUrls = urls && urls.length > 0 ? urls : DEFAULT_PAGES;
  const pages = await fetchWebsitePages(pageUrls);
  const data: KvWebsiteData = { pages, cachedAt: Date.now() };
  cachedWebsite = data;
  cacheTimestamp = Date.now();
  await setKvWebsite(data);
  return pages;
}

export async function getWebsiteContent(urls?: string[]): Promise<KvWebsitePage[]> {
  // L1: in-memory
  if (cachedWebsite && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedWebsite.pages;
  }

  // L2: Redis
  try {
    const kvWebsite = await getKvWebsite();
    if (kvWebsite && Date.now() - kvWebsite.cachedAt < CACHE_TTL_MS) {
      cachedWebsite = kvWebsite;
      cacheTimestamp = kvWebsite.cachedAt;
      return kvWebsite.pages;
    }
  } catch {
    // Fall through
  }

  // L3: Fetch from website
  return syncWebsite(urls);
}

export function buildWebsiteContext(pages: KvWebsitePage[]): string {
  if (pages.length === 0) return "";
  const entries = pages
    .map((p) => `--- ${p.title} (${p.url}) ---\n${p.content}`)
    .join("\n\n");
  return `=== Website Content (e-flight.nl) ===\n${entries}`;
}
