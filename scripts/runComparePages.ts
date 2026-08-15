import { readFileSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { buildComparePage } from '../agents/comparePageBuilder';
import { pool } from '../db/knowledgeDB';
import { closeDocumentStore } from '../db/documentStore';

type ComparePageRow = {
  slug: string;
  providerSlugs: string[];
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function loadComparePageRows(): ComparePageRow[] {
  const csvPath = path.join(__dirname, '../data/compare-pages.csv');
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  return lines.slice(1).map((line) => {
    const [slug, providerSlugsRaw] = parseCsvLine(line);
    const providerSlugs = providerSlugsRaw
      .replace(/^"|"$/g, '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!slug || !providerSlugs.length) {
      throw new Error(`Invalid compare page row: ${line}`);
    }

    return { slug, providerSlugs };
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  let slugFilter: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--slug' && args[i + 1]) {
      slugFilter = args[++i];
    }
  }

  return { slugFilter };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const { slugFilter } = parseArgs();
  const rows = loadComparePageRows().filter((row) => !slugFilter || row.slug === slugFilter);

  if (!rows.length) {
    console.error('No compare page rows matched');
    process.exit(1);
  }

  for (const row of rows) {
    await buildComparePage(row.slug, row.providerSlugs);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await pool.end();
  await closeDocumentStore();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  await closeDocumentStore().catch(() => undefined);
  process.exit(1);
});
