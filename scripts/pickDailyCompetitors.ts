import 'dotenv/config';
import { appendFileSync, readdirSync } from 'fs';
import path from 'path';
import { db, pool } from '../db/knowledgeDB';

// Picks the N competitors whose data is most stale (or has never been
// scraped) so the daily refresh cycles through the whole shortlist instead
// of re-hitting the same few. Reuses `competitors.last_scraped_at`, which
// `agents/scraper.ts` already stamps on every successful scrape — no new
// tracking table needed.
//
// The `competitors` table holds every company ever researched (~260 rows),
// including excluded/watch-list entries (regional Indian banks, crypto
// exchanges, etc.) that were never meant to get a live compare page. Only
// the slugs that already have a providers/<slug>.json in the sibling
// Sliq-website checkout are "live" — the daily refresh must stay scoped to
// that set, or it'll waste scrape/LLM cost on entries with no page and (once
// exportProviderEvidence runs) silently publish new ones that were never
// vetted for the live comparison set.
const WEBSITE_ROOT = path.resolve(__dirname, '../../Sliq-website');
const PROVIDERS_DIR = path.join(WEBSITE_ROOT, 'src/content/compare/providers');
const NON_COMPETITOR_FILES = new Set(['sliq.json', '_index.json', 'competitors.json']);

function getLiveSlugs(): string[] {
  return readdirSync(PROVIDERS_DIR)
    .filter((f) => f.endsWith('.json') && !NON_COMPETITOR_FILES.has(f))
    .map((f) => f.replace(/\.json$/, ''));
}

async function main() {
  const count = Number(process.argv[2] ?? 2);
  const liveSlugs = getLiveSlugs();

  if (!liveSlugs.length) {
    console.error(`No live provider files found in ${PROVIDERS_DIR}.`);
    process.exit(1);
  }

  const { rows } = await db.query<{ id: number; name: string; slug: string }>(
    `SELECT id, name, slug FROM competitors
     WHERE slug = ANY($1)
     ORDER BY last_scraped_at ASC NULLS FIRST, id ASC
     LIMIT $2`,
    [liveSlugs, count]
  );

  if (!rows.length) {
    console.error('No live competitors found in the competitors table.');
    process.exit(1);
  }

  const ids = rows.map((r) => r.id).join(',');
  console.log(`Picked ${rows.length} competitor(s): ${rows.map((r) => `${r.id}:${r.name}`).join(', ')}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `ids=${ids}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `names=${rows.map((r) => r.name).join(', ')}\n`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
