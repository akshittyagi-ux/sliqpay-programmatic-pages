import 'dotenv/config';
import { scrapeCompetitor, ScrapeFailedError } from '../agents/scraper';
import { enrichMetadata } from '../agents/metadata';
import { db, pool } from '../db/knowledgeDB';
import { closeDocumentStore } from '../db/documentStore';

const ids = Array.from({ length: 257 - 215 + 1 }, (_, i) => 215 + i);

async function alreadyDone(id: number): Promise<boolean> {
  const { rows } = await db.query<{ scrape_status: string; has_metadata: boolean }>(
    `SELECT c.scrape_status,
            EXISTS(SELECT 1 FROM competitor_metadata m WHERE m.competitor_id = c.id) AS has_metadata
     FROM competitors c WHERE c.id = $1`,
    [id]
  );
  const row = rows[0];
  return Boolean(row && row.scrape_status === 'done' && row.has_metadata);
}

async function main() {
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    if (await alreadyDone(id)) {
      skipped++;
      console.log(`Skipping ${id} — already scraped + enriched`);
      continue;
    }

    const { rows } = await db.query<{ id: number; name: string; website_url: string }>(
      `SELECT id, name, website_url FROM competitors WHERE id = $1`,
      [id]
    );
    const c = rows[0];
    if (!c) {
      console.warn(`Competitor ${id} not found, skipping`);
      continue;
    }

    try {
      console.log(`\n=== Processing ${c.id}: ${c.name} (${c.website_url}) ===`);
      const scrape = await scrapeCompetitor(c.id, c.website_url);
      if (scrape.pageCount === 0) {
        throw new ScrapeFailedError('No pages scraped', scrape);
      }
      await enrichMetadata(c.id);
      processed++;
      console.log(`Done ${c.id}: ${c.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed ${c.id}: ${c.name} — ${message}`);
      errors.push(`${c.id} ${c.name}: ${message}`);
    }
  }

  console.log(`\nRun complete. Processed ${processed}, skipped ${skipped}, errors ${errors.length}`);
  if (errors.length) {
    console.log('Errors:\n' + errors.join('\n'));
  }

  await pool.end();
  await closeDocumentStore();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
