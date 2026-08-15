import 'dotenv/config';
import { appendFileSync } from 'fs';
import { db, pool } from '../db/knowledgeDB';

// Picks the N competitors whose data is most stale (or has never been
// scraped) so the daily refresh cycles through the whole shortlist instead
// of re-hitting the same few. Reuses `competitors.last_scraped_at`, which
// `agents/scraper.ts` already stamps on every successful scrape — no new
// tracking table needed.
async function main() {
  const count = Number(process.argv[2] ?? 2);

  const { rows } = await db.query<{ id: number; name: string; slug: string }>(
    `SELECT id, name, slug FROM competitors
     ORDER BY last_scraped_at ASC NULLS FIRST, id ASC
     LIMIT $1`,
    [count]
  );

  if (!rows.length) {
    console.error('No competitors found in the competitors table.');
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
