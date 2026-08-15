import 'dotenv/config';
import { scrapeCompetitor, ScrapeFailedError } from '../agents/scraper';
import { enrichMetadata } from '../agents/metadata';
import { db, pool } from '../db/knowledgeDB';
import { closeDocumentStore } from '../db/documentStore';

async function main() {
  const id = Number(process.argv[2]);
  if (!id) {
    console.error('Usage: scrapeOneCompetitor.ts <competitorId>');
    process.exit(1);
  }

  const { rows } = await db.query<{ id: number; name: string; website_url: string }>(
    `SELECT id, name, website_url FROM competitors WHERE id = $1`,
    [id]
  );
  const c = rows[0];
  if (!c) {
    console.error(`Competitor ${id} not found`);
    process.exit(1);
  }

  console.log(`\n=== Processing ${c.id}: ${c.name} (${c.website_url}) ===`);
  const scrape = await scrapeCompetitor(c.id, c.website_url);
  if (scrape.pageCount === 0) {
    throw new ScrapeFailedError('No pages scraped', scrape);
  }
  await enrichMetadata(c.id);
  console.log(`Done ${c.id}: ${c.name}`);

  await pool.end();
  await closeDocumentStore();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
