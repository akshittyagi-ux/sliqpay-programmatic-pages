import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db, pool } from '../db/knowledgeDB';
import {
  parseCompetitorCsv,
  fetchGoogleSheetCsv,
  upsertCompetitors,
  DEFAULT_GOOGLE_SHEET_ID,
  googleSheetExportUrl,
} from './competitorImport';

async function main() {
  const args = process.argv.slice(2);
  const fromSheet = args.includes('--from-sheet');
  const fileArg = args.find((a) => !a.startsWith('--'));
  let csvText: string;
  let source: string;

  if (fromSheet || process.env.COMPETITORS_SEED_FROM_SHEET === 'true') {
    const sheetId = process.env.COMPETITORS_SHEET_ID ?? DEFAULT_GOOGLE_SHEET_ID;
    const gid = process.env.COMPETITORS_SHEET_GID ?? '0';
    source = `Google Sheet (${sheetId})`;
    console.log(`Fetching: ${googleSheetExportUrl(sheetId, gid)}`);
    csvText = await fetchGoogleSheetCsv(sheetId, gid);
  } else {
    const csvPath =
      fileArg || path.join(__dirname, '../data/competitors.csv');
    if (!fs.existsSync(csvPath)) {
      console.error(`CSV not found: ${csvPath}`);
      console.error('');
      console.error('Options:');
      console.error('  1. npm run seed:sheet     — import from manager Google Sheet (must be public)');
      console.error('  2. Save sheet as data/competitors.csv, then npm run seed');
      process.exit(1);
    }
    source = csvPath;
    csvText = fs.readFileSync(csvPath, 'utf8');
  }

  const rows = parseCompetitorCsv(csvText);
  console.log(`Parsed ${rows.length} competitors from ${source}`);

  const { inserted, updated } = await upsertCompetitors(rows);
  console.log(`Seed complete: ${inserted} inserted, ${updated} updated`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
