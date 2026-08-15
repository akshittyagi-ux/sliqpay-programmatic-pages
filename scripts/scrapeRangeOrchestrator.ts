import 'dotenv/config';
import { spawnSync } from 'child_process';
import path from 'path';
import { db, pool } from '../db/knowledgeDB';

const ids = Array.from({ length: 257 - 215 + 1 }, (_, i) => 215 + i);
const TS_NODE_BIN = path.join(__dirname, '../node_modules/ts-node/dist/bin.js');
const WORKER_SCRIPT = path.join(__dirname, 'scrapeOneCompetitor.ts');

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

    console.log(`\n>>> Spawning worker for competitor ${id}`);
    const result = spawnSync(process.execPath, [TS_NODE_BIN, WORKER_SCRIPT, String(id)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
      timeout: 30 * 60 * 1000,
    });

    if (result.status === 0) {
      processed++;
    } else {
      const reason =
        result.error?.message ?? (result.signal ? `killed by ${result.signal}` : `exit code ${result.status}`);
      errors.push(`${id}: ${reason}`);
      console.error(`Worker for ${id} failed: ${reason}`);
    }
  }

  console.log(`\nOrchestrator complete. Processed ${processed}, skipped ${skipped}, errors ${errors.length}`);
  if (errors.length) {
    console.log('Errors:\n' + errors.join('\n'));
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
