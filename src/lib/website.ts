import * as cheerio from "cheerio";
import {
  getKvWebsite,
  setKvWebsite,
  type KvWebsitePage,
  type KvWebsiteData,
} from "./kv-cache";

// --- Constants ---
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PAGES = 30;
const MAX_CHARS_PER_PAGE = 8000;
const MAX_TOTAL_CHARS = 60000;
const FETCH_TIMEOUT_MS = 10000; // 10s per page
const MAX_SUB_SITEMAPS = 5;
const MAX_URLS_PER_SITEMAP = 15; // Limit URLs from each sub-sitemap
const DEFAULT_DOMAIN = "www.eflight.nl";

const DEFAULT_PAGES = [
  `https://${DEFAULT_DOMAIN}`,
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

// --- Sitemap discovery ---
async function fetchSitemap(domain: string): Promise<string[]> {
  const sitemapUrl = `https://${domain}/sitemap.xml`;
  console.log(`Fetching sitemap: ${sitemapUrl}`);

  let response: Response;
  try {
    response = await doFetch(sitemapUrl);
  } catch {
    if (sitemapUrl.startsWith("https://")) {
      response = await doFetch(sitemapUrl.replace("https://", "http://"));
    } else {
      throw new Error(`Sitemap fetch failed for ${domain}`);
    }
  }

  if (!response.ok) {
    console.warn(`Sitemap not found for ${domain}: HTTP ${response.status}`);
    return [];
  }

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  // Check if it's a sitemap index (<sitemapindex>)
  const sitemapLocs = $("sitemapindex sitemap loc")
    .map((_, el) => $(el).text().trim())
    .get();

  if (sitemapLocs.length > 0) {
    console.log(`Sitemap index found with ${sitemapLocs.length} sub-sitemaps`);

    // Prioritize collections and pages over products
    const priorityOrder = ["collections", "pages", "products", "blogs"];
    const sortedLocs = [...sitemapLocs].sort((a, b) => {
      const aIdx = priorityOrder.findIndex((p) => a.includes(p));
      const bIdx = priorityOrder.findIndex((p) => b.includes(p));
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    const allUrls: string[] = [];
    for (const subUrl of sortedLocs.slice(0, MAX_SUB_SITEMAPS)) {
      try {
        const subResp = await doFetch(subUrl);
        if (!subResp.ok) continue;
        const subXml = await subResp.text();
        const sub$ = cheerio.load(subXml, { xmlMode: true });
        const subUrls: string[] = [];
        sub$("url loc").each((_, el) => {
          subUrls.push(sub$(el).text().trim());
        });
        // Limit URLs per sub-sitemap to ensure variety
        allUrls.push(...subUrls.slice(0, MAX_URLS_PER_SITEMAP));
        console.log(`  - ${subUrl.split("/").pop()}: ${subUrls.length} URLs (using ${Math.min(subUrls.length, MAX_URLS_PER_SITEMAP)})`);
      } catch {
        console.warn(`Failed to fetch sub-sitemap: ${subUrl}`);
      }
    }
    // Remove duplicates and filter by domain
    const filtered = [...new Set(allUrls)].filter((u) => u.includes(domain));
    console.log(`Discovered ${filtered.length} unique URLs from sitemap index`);
    return filtered;
  }

  // Regular sitemap
  const urls = $("url loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((u) => u.includes(domain));

  console.log(`Discovered ${urls.length} URLs from sitemap`);
  return urls;
}

/** Check if a URL is a domain root (no path beyond /) */
function isDomainRoot(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return false;
  }
}

/**
 * Resolve a list of URLs: domain roots are expanded via sitemap discovery,
 * specific page URLs are kept as-is. This allows mixing domains and pages,
 * e.g. ["https://www.eflight.nl", "https://e-deck.nl", "https://other.com/specific-page"]
 */
async function resolveUrls(urls: string[]): Promise<string[]> {
  const resolved: string[] = [];

  for (const url of urls) {
    if (isDomainRoot(url)) {
      // Domain root — try sitemap discovery
      try {
        const domain = new URL(url).hostname;
        const discovered = await fetchSitemap(domain);
        if (discovered.length > 0) {
          resolved.push(...discovered);
        } else {
          resolved.push(url); // Sitemap empty — keep the root URL
        }
      } catch {
        resolved.push(url); // Sitemap failed — keep the root URL
      }
    } else {
      // Specific page — keep as-is
      resolved.push(url);
    }
  }

  return resolved;
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
  const inputUrls = urls && urls.length > 0 ? urls : DEFAULT_PAGES;
  const pageUrls = await resolveUrls(inputUrls);

  console.log(`Syncing ${pageUrls.length} website pages (limit: ${MAX_PAGES})`);
  const pages = await fetchWebsitePages(pageUrls);
  const data: KvWebsiteData = { pages, cachedAt: Date.now() };
  cachedWebsite = data;
  cacheTimestamp = Date.now();
  await setKvWebsite(data);
  console.log(`Website sync complete: ${pages.length} pages, ${pages.reduce((sum, p) => sum + p.content.length, 0)} chars`);
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
  return `=== Website Content (${DEFAULT_DOMAIN}) ===\n${entries}`;
}
