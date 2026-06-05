import { db } from '../db/knowledgeDB';

/** Manager's competitor list (share sheet: Anyone with the link → Viewer) */
export const DEFAULT_GOOGLE_SHEET_ID = '1iMcfRuqJivLIvBDLffEkYAPbmm1XuTj8j4U810UtHqo';

export function googleSheetExportUrl(sheetId: string, gid = '0'): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export type CompetitorRow = {
  name: string;
  website_url: string;
  slug: string;
  sheet_metadata: Record<string, string>;
};

const NAME_HEADERS = ['company', 'name', 'competitor', 'brand', 'competitor name', 'service'];
const URL_HEADERS = [
  'website_url',
  'website',
  'url',
  'site',
  'website url',
  'domain',
  'homepage',
  'link',
];
const SLUG_HEADERS = ['slug', 'id', 'key'];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function parseCompetitorCsv(csvText: string): CompetitorRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV has no data rows');
  }

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const nameIdx = findColumnIndex(header, NAME_HEADERS);
  const urlIdx = findColumnIndex(header, URL_HEADERS);
  const slugIdx = findColumnIndex(header, SLUG_HEADERS);

  if (nameIdx === -1 || urlIdx === -1) {
    throw new Error(
      `Could not find name/website columns. Headers found: ${header.join(', ')}\n` +
        `Expected something like: name, website_url (or competitor, website, url)`
    );
  }

  const rows: CompetitorRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const name = cols[nameIdx]?.trim();
    let website_url = normalizeUrl(cols[urlIdx] ?? '');
    if (!name || !website_url) continue;

    const slug =
      slugIdx >= 0 && cols[slugIdx]?.trim() ? slugify(cols[slugIdx]) : slugify(name);

    const sheet_metadata: Record<string, string> = {};
    header.forEach((col, i) => {
      if (i === nameIdx || i === urlIdx || i === slugIdx) return;
      const val = cols[i]?.trim();
      if (val) sheet_metadata[col] = val;
    });

    rows.push({ name, website_url, slug, sheet_metadata });
  }

  if (rows.length === 0) {
    throw new Error('No valid competitor rows (need name + website/url per row)');
  }

  return rows;
}

export async function fetchGoogleSheetCsv(
  sheetId = process.env.COMPETITORS_SHEET_ID ?? DEFAULT_GOOGLE_SHEET_ID,
  gid = process.env.COMPETITORS_SHEET_GID ?? '0'
): Promise<string> {
  const url =
    process.env.COMPETITORS_SHEET_EXPORT_URL ?? googleSheetExportUrl(sheetId, gid);

  const response = await fetch(url, {
    headers: { 'User-Agent': 'sliqpay-programmatic-pages/1.0' },
    redirect: 'follow',
  });

  const text = await response.text();

  if (text.includes('Sign in') && text.includes('Google')) {
    throw new Error(
      'Google Sheet is not public. Ask your manager: Share → General access → ' +
        '"Anyone with the link" as Viewer. Then re-run: npm run seed:sheet'
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Google Sheet is not accessible (private or restricted). Ask your manager: ' +
          'Share → General access → "Anyone with the link" as Viewer. Then run: npm run seed:sheet'
      );
    }
    throw new Error(`Failed to fetch sheet (HTTP ${response.status})`);
  }

  if (text.trim().length < 10) {
    throw new Error('Fetched sheet CSV is empty');
  }

  return text;
}

export async function upsertCompetitors(rows: CompetitorRow[]): Promise<{
  inserted: number;
  updated: number;
}> {
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await db.query(`SELECT id FROM competitors WHERE slug = $1`, [row.slug]);
    await db.query(
      `
      INSERT INTO competitors (name, website_url, slug, sheet_metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          website_url = EXCLUDED.website_url,
          sheet_metadata = EXCLUDED.sheet_metadata
    `,
      [row.name, row.website_url, row.slug, row.sheet_metadata]
    );

    if (existing.rows.length === 0) inserted++;
    else updated++;
  }

  return { inserted, updated };
}
