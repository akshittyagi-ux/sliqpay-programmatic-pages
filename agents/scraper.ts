import { chromium, type Page } from 'playwright';
import * as cheerio from 'cheerio';
import { db } from '../db/knowledgeDB';
import { upsertKnowledgePage } from '../db/knowledgePages';
import { COMMON_PROBE_PATHS, EXCLUDED_PATH_PATTERNS } from './scraperPaths';

const MAX_PAGES_PER_COMPETITOR = 100;
const GOTO_TIMEOUT_MS = 45_000;
const HYDRATION_WAIT_MS = 2_000;

export type ScrapeResult = {
  pageCount: number;
  urls: string[];
  failedUrls: string[];
};

export class ScrapeFailedError extends Error {
  constructor(
    message: string,
    public readonly result: ScrapeResult
  ) {
    super(message);
    this.name = 'ScrapeFailedError';
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function isSameOrigin(absolute: string, baseOrigin: string): boolean {
  try {
    return new URL(absolute).origin === new URL(baseOrigin).origin;
  } catch {
    return false;
  }
}

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return EXCLUDED_PATH_PATTERNS.some((p) => lower.includes(p));
}

function extractLinks(html: string, pageUrl: string, baseOrigin: string): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();

  const add = (href: string | undefined) => {
    if (!href) return;
    const trimmed = href.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:') ||
      trimmed.startsWith('javascript:')
    ) {
      return;
    }
    try {
      const absolute = normalizeUrl(new URL(trimmed, pageUrl).toString());
      if (isSameOrigin(absolute, baseOrigin) && !shouldSkipUrl(absolute)) {
        found.add(absolute);
      }
    } catch {
      /* ignore bad URLs */
    }
  };

  $('a[href]').each((_, el) => add($(el).attr('href')));
  $('link[href]').each((_, el) => add($(el).attr('href')));
  $('[data-href], [data-url], [data-link]').each((_, el) => {
    add($(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-link'));
  });

  // URLs embedded in inline JSON / scripts (common on SPAs)
  const urlPattern = /https?:\/\/[a-z0-9.-]+(?:\/[^\s"'<>\\]*)?/gi;
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    for (const match of text.matchAll(urlPattern)) {
      add(match[0]);
    }
  });

  return [...found];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'sliqpay-programmatic-pages/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function discoverSitemapUrls(baseUrl: string, baseOrigin: string): Promise<string[]> {
  const candidates = [
    `${baseOrigin}/sitemap.xml`,
    `${baseOrigin}/sitemap_index.xml`,
    `${baseOrigin}/sitemap-index.xml`,
    `${baseOrigin}/robots.txt`,
  ];

  const urls = new Set<string>();

  for (const sitemapUrl of candidates) {
    const text = await fetchText(sitemapUrl);
    if (!text) continue;

    if (sitemapUrl.endsWith('robots.txt')) {
      for (const line of text.split('\n')) {
        const m = line.match(/^Sitemap:\s*(.+)$/i);
        if (m?.[1]) {
          const nested = await fetchText(m[1].trim());
          if (nested) parseSitemapXml(nested, baseOrigin, urls);
        }
      }
      continue;
    }

    parseSitemapXml(text, baseOrigin, urls);
  }

  return [...urls].filter((u) => !shouldSkipUrl(u)).slice(0, 80);
}

function parseSitemapXml(xml: string, baseOrigin: string, out: Set<string>) {
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    try {
      const loc = normalizeUrl(match[1].trim());
      if (isSameOrigin(loc, baseOrigin) && !shouldSkipUrl(loc)) {
        out.add(loc);
      }
    } catch {
      /* skip */
    }
  }
}

function buildInitialQueue(baseUrl: string, sitemapUrls: string[]): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const queue: string[] = [];

  for (const path of COMMON_PROBE_PATHS) {
    try {
      queue.push(normalizeUrl(new URL(path, baseUrl).toString()));
    } catch {
      /* skip */
    }
  }

  for (const url of sitemapUrls) {
    queue.push(normalizeUrl(url));
  }

  queue.push(normalizeUrl(baseUrl));

  return [...new Set(queue)].filter((u) => isSameOrigin(u, baseOrigin) && !shouldSkipUrl(u));
}

async function loadPageContent(page: Page, url: string): Promise<string> {
  const strategies: Array<{ waitUntil: 'domcontentloaded' | 'load' | 'networkidle'; timeout: number }> = [
    { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS },
    { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS },
    { waitUntil: 'networkidle', timeout: 25_000 },
  ];

  let lastError: unknown;
  for (const strategy of strategies) {
    try {
      await page.goto(url, { waitUntil: strategy.waitUntil, timeout: strategy.timeout });
      await page.waitForTimeout(HYDRATION_WAIT_MS);
      const html = await page.content();
      if (html.length > 500) return html;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error(`Failed to load ${url}`);
}

export async function scrapeCompetitor(competitorId: number, baseUrl: string): Promise<ScrapeResult> {
  const baseOrigin = new URL(baseUrl).origin;
  const browser = await chromium.launch({ headless: true });
  const visited = new Set<string>();
  const savedUrls: string[] = [];
  const failedUrls: string[] = [];

  console.log(`Discovering URLs for ${baseUrl}...`);
  const sitemapUrls = await discoverSitemapUrls(baseUrl, baseOrigin);
  console.log(`  Sitemap/probes: ${sitemapUrls.length} URLs from sitemap`);

  const queue = buildInitialQueue(baseUrl, sitemapUrls);
  console.log(`  Initial queue: ${queue.length} URLs (common paths + sitemap + homepage)`);

  await db.query(`UPDATE competitors SET scrape_status = 'running' WHERE id = $1`, [competitorId]);

  try {
    while (queue.length > 0 && savedUrls.length < MAX_PAGES_PER_COMPETITOR) {
      const url = normalizeUrl(queue.shift()!);
      if (visited.has(url) || shouldSkipUrl(url)) continue;
      visited.add(url);

      let page: Page | undefined;
      try {
        page = await browser.newPage();
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
        const html = await loadPageContent(page, url);
        const $ = cheerio.load(html);

        $('script, style, nav, footer, header, noscript, svg').remove();
        const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
        const title = $('title').text().trim();

        if (cleanText.length < 80) {
          console.warn(`  Skipped (thin content): ${url}`);
          failedUrls.push(url);
          continue;
        }

        await upsertKnowledgePage({
          competitorId,
          url,
          title: title || null,
          rawHtml: html,
          cleanText,
        });

        const discovered = extractLinks(html, url, baseOrigin);
        for (const link of discovered) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }

        savedUrls.push(url);
        console.log(`  Saved (${savedUrls.length}): ${url}`);
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        failedUrls.push(url);
        console.error(`  Failed: ${url}`, err instanceof Error ? err.message : err);
      } finally {
        await page?.close().catch(() => undefined);
      }
    }

    const result: ScrapeResult = {
      pageCount: savedUrls.length,
      urls: savedUrls,
      failedUrls,
    };

    if (result.pageCount === 0) {
      await db.query(`UPDATE competitors SET scrape_status = 'failed' WHERE id = $1`, [competitorId]);
      throw new ScrapeFailedError(
        `Scrape produced 0 pages for competitor ${competitorId}. Failed URLs: ${failedUrls.slice(0, 5).join(', ')}`,
        result
      );
    }

    await db.query(
      `UPDATE competitors SET scrape_status = 'done', last_scraped_at = NOW() WHERE id = $1`,
      [competitorId]
    );

    console.log(
      `Scraped ${result.pageCount} pages for competitor ${competitorId} (${failedUrls.length} failed/skipped)`
    );
    return result;
  } catch (err) {
    if (!(err instanceof ScrapeFailedError)) {
      await db.query(`UPDATE competitors SET scrape_status = 'failed' WHERE id = $1`, [competitorId]);
    }
    throw err;
  } finally {
    await browser.close();
  }
}
