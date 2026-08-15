import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { db, pool } from '../db/knowledgeDB';

const WEBSITE_ROOT = path.resolve(__dirname, '../../Sliq-website');
const OUTPUT_PATH = path.join(WEBSITE_ROOT, 'src/content/compare/competitors.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const { rows } = await db.query<{ id: number; slug: string; name: string }>(
    `SELECT id, slug, name FROM competitors WHERE id BETWEEN 215 AND 257 ORDER BY name`
  );

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`Exported ${rows.length} competitors to ${OUTPUT_PATH}`);

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
