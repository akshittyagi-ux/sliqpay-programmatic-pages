import { scrapeCompetitor, ScrapeFailedError } from '../agents/scraper';
import { enrichMetadata } from '../agents/metadata';
import { summarizeAllPageTypes } from '../agents/summarizer';
import { db } from '../db/knowledgeDB';

export type PipelineOptions = {
  onlyPending?: boolean;
  competitorIds?: number[];
  skipScrape?: boolean;
  skipMetadata?: boolean;
  skipSummarize?: boolean;
};

export async function runFullPipeline(options: PipelineOptions = {}) {
  const onlyPending = options.onlyPending ?? false;
  const params: unknown[] = [];
  const conditions: string[] = ['1=1'];

  if (onlyPending) {
    conditions.push(`scrape_status = 'pending'`);
  }

  if (options.competitorIds?.length) {
    params.push(options.competitorIds);
    conditions.push(`id = ANY($${params.length}::int[])`);
  }

  const { rows: competitors } = await db.query<{
    id: number;
    name: string;
    website_url: string;
  }>(
    `
    SELECT id, name, website_url FROM competitors
    WHERE ${conditions.join(' AND ')}
    ORDER BY id
  `,
    params
  );

  const runLog = await db.query<{ id: number }>(
    `INSERT INTO cron_runs (run_type) VALUES ('full') RETURNING id`
  );
  const runId = runLog.rows[0].id;

  let processed = 0;
  const errors: string[] = [];

  for (const competitor of competitors) {
    try {
      console.log(`\nProcessing: ${competitor.name} (${competitor.website_url})`);

      if (!options.skipScrape) {
        const scrape = await scrapeCompetitor(competitor.id, competitor.website_url);
        if (scrape.pageCount === 0) {
          throw new ScrapeFailedError('No pages scraped', scrape);
        }
      }

      if (!options.skipMetadata) {
        await enrichMetadata(competitor.id);
      }

      if (!options.skipSummarize) {
        await summarizeAllPageTypes(competitor.id, competitor.name);
      }

      processed++;
      await db.query(`UPDATE cron_runs SET competitors_processed = $1 WHERE id = $2`, [
        processed,
        runId,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed: ${competitor.name}`, err);
      errors.push(`${competitor.name}: ${message}`);
      await db.query(`UPDATE competitors SET scrape_status = 'failed' WHERE id = $1`, [
        competitor.id,
      ]);
    }
  }

  const status = errors.length === competitors.length && competitors.length > 0 ? 'failed' : 'done';

  await db.query(
    `
    UPDATE cron_runs
    SET status = $1, finished_at = NOW(), error_log = $2
    WHERE id = $3
  `,
    [status, errors.length ? errors.join('\n') : null, runId]
  );

  console.log(
    `\nPipeline complete. Processed ${processed}/${competitors.length} competitors.`
  );

  return { processed, total: competitors.length, runId, errors };
}
