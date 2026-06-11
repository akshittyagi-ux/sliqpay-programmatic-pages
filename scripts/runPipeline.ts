import 'dotenv/config';
import { runFullPipeline } from '../cron/monthly';
import { scrapeCompetitor, ScrapeFailedError } from '../agents/scraper';
import { enrichMetadata } from '../agents/metadata';
import { summarizeForPageType, summarizeAllPageTypes } from '../agents/summarizer';
import {
  PAGE_TYPES,
  isValidPageType,
  LEGACY_PAGE_TYPE_MAP,
  type PageTypeId,
} from '../agents/pageTypes';
import { db, pool } from '../db/knowledgeDB';
import { closeDocumentStore } from '../db/documentStore';

function resolvePageType(input: string): PageTypeId {
  if (isValidPageType(input)) return input;
  const mapped = LEGACY_PAGE_TYPE_MAP[input];
  if (mapped) {
    console.warn(`Deprecated page type "${input}" — use "${mapped}"`);
    return mapped;
  }
  throw new Error(`Unknown page type "${input}". Valid ids:\n  ${PAGE_TYPES.join('\n  ')}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const ids: number[] = [];
  let onlyPending = false;
  let scrapeOnly = false;
  let metadataOnly = false;
  let summarizeOnly = false;
  let singlePageType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pending') onlyPending = true;
    if (arg === '--scrape-only') scrapeOnly = true;
    if (arg === '--metadata-only') metadataOnly = true;
    if (arg === '--summarize-only') summarizeOnly = true;
    if (arg === '--ids' && args[i + 1]) {
      ids.push(...args[++i].split(',').map((id) => parseInt(id, 10)));
    }
    if (arg === '--page-type' && args[i + 1]) {
      singlePageType = args[++i];
    }
  }

  return { ids, onlyPending, scrapeOnly, metadataOnly, summarizeOnly, singlePageType };
}

async function runSingleCompetitorSteps(
  competitorId: number,
  options: ReturnType<typeof parseArgs>
) {
  const { rows } = await db.query<{ id: number; name: string; website_url: string }>(
    `SELECT id, name, website_url FROM competitors WHERE id = $1`,
    [competitorId]
  );
  const c = rows[0];
  if (!c) throw new Error(`Competitor ${competitorId} not found`);

  if (!options.metadataOnly && !options.summarizeOnly) {
    const scrape = await scrapeCompetitor(c.id, c.website_url);
    console.log(`Scrape summary: ${scrape.pageCount} pages saved`);
    if (scrape.pageCount === 0) {
      throw new ScrapeFailedError('No pages scraped — skipping metadata and summarize', scrape);
    }
  }

  if (!options.scrapeOnly && !options.summarizeOnly) {
    await enrichMetadata(c.id);
  }

  if (options.singlePageType) {
    await summarizeForPageType(c.id, c.name, resolvePageType(options.singlePageType));
  } else if (options.summarizeOnly || (!options.scrapeOnly && !options.metadataOnly)) {
    await summarizeAllPageTypes(c.id, c.name);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const options = parseArgs();

  if (options.ids.length === 1) {
    await runSingleCompetitorSteps(options.ids[0], options);
    await pool.end();
    await closeDocumentStore();
    return;
  }

  await runFullPipeline({
    onlyPending: options.onlyPending,
    competitorIds: options.ids.length ? options.ids : undefined,
    skipScrape: options.metadataOnly,
    skipMetadata: options.scrapeOnly,
    skipSummarize: options.scrapeOnly || options.metadataOnly,
  });

  await pool.end();
  await closeDocumentStore();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
