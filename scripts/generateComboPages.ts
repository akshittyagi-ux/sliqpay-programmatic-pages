import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db, pool } from '../db/knowledgeDB';

const CSV_PATH = path.join(__dirname, '../data/compare-pages.csv');

async function main() {
  const { rows } = await db.query<{ id: number; slug: string; name: string }>(
    `SELECT id, slug, name FROM competitors WHERE id BETWEEN 215 AND 257 ORDER BY id`
  );

  if (rows.length !== 43) {
    console.warn(`Expected 43 competitors in range 215-257, found ${rows.length}`);
  }

  const existingText = fs.readFileSync(CSV_PATH, 'utf8');
  const existingLines = existingText.split(/\r?\n/).filter((l) => l.trim());
  const existingSlugs = new Set(
    existingLines.slice(1).map((line) => line.split(',')[0].trim())
  );

  const newRows: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const [first, second] = [a, b].sort((x, y) => x.slug.localeCompare(y.slug));
      const slug = `${first.slug}-vs-${second.slug}-vs-sliq-pay`;
      if (existingSlugs.has(slug)) continue;
      newRows.push(`${slug},"${first.slug},${second.slug}"`);
      existingSlugs.add(slug);
    }
  }

  const updatedText = existingText.replace(/\s*$/, '\n') + newRows.join('\n') + '\n';
  fs.writeFileSync(CSV_PATH, updatedText);

  console.log(`Competitors in range: ${rows.length}`);
  console.log(`New pair rows appended: ${newRows.length}`);
  console.log(`Total rows in CSV now: ${existingLines.length - 1 + newRows.length}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
