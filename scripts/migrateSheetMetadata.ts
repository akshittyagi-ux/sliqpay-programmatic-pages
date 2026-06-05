/**
 * Adds sheet_metadata column to existing databases.
 * Run: npx ts-node scripts/migrateSheetMetadata.ts
 */
import 'dotenv/config';
import { pool } from '../db/knowledgeDB';

async function main() {
  await pool.query(`
    ALTER TABLE competitors
    ADD COLUMN IF NOT EXISTS sheet_metadata JSONB
  `);
  console.log('Migration complete: competitors.sheet_metadata');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
