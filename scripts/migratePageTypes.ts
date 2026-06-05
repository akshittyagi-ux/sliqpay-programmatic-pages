/**
 * One-time migration: renames legacy page_type values in page_content to canonical ids.
 * Run: npx ts-node scripts/migratePageTypes.ts
 */
import 'dotenv/config';
import { LEGACY_PAGE_TYPE_MAP } from '../agents/pageTypes';
import { db, pool } from '../db/knowledgeDB';

async function main() {
  for (const [legacy, canonical] of Object.entries(LEGACY_PAGE_TYPE_MAP)) {
    const result = await db.query(
      `UPDATE page_content SET page_type = $1 WHERE page_type = $2`,
      [canonical, legacy]
    );
    if (result.rowCount) {
      console.log(`Migrated ${result.rowCount} rows: ${legacy} → ${canonical}`);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
