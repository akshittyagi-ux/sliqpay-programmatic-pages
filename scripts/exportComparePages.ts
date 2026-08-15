import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { db, pool } from '../db/knowledgeDB';
import type { ComparePageDocument } from '../agents/comparePageTypes';
import { validateComparePageDocument } from '../agents/compareValidation';

const WEBSITE_ROOT = path.resolve(__dirname, '../../Sliq-website');
const PAGES_DIR = path.join(WEBSITE_ROOT, 'src/content/compare/pages');
const CONFIG_PATH = path.join(WEBSITE_ROOT, 'src/content/compare/config.json');

type ComparePageRow = {
  slug: string;
  provider_slugs: string[];
  content: Record<string, unknown>;
  meta_title: string | null;
  meta_description: string | null;
};

function normalizeAssetPaths(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\/image\/programmatic\/sliq\.svg/g, '/image/programmatic/sliq-pay.svg');
  }
  if (Array.isArray(value)) {
    return value.map(normalizeAssetPaths);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeAssetPaths(entry)])
    );
  }
  return value;
}

function stripExportFields(content: Record<string, unknown>) {
  const { data_gaps: _dataGaps, ...exportContent } = content;
  return normalizeAssetPaths(exportContent) as Record<string, unknown>;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const { rows } = await db.query<ComparePageRow>(
    `SELECT slug, provider_slugs, content, meta_title, meta_description FROM compare_pages ORDER BY slug`
  );

  if (!rows.length) {
    console.error('No compare_pages rows found. Run npm run compare:build first.');
    process.exit(1);
  }

  mkdirSync(PAGES_DIR, { recursive: true });

  const publishedSlugs: string[] = [];
  const dataGapsReport: { slug: string; gaps: string[] }[] = [];

  for (const row of rows) {
    const content = stripExportFields(row.content);
    const pageDocument = {
      ...content,
      slug: row.slug,
      meta: {
        ...(typeof content.meta === 'object' && content.meta ? content.meta : {}),
        title: row.meta_title ?? (content.meta as { title?: string })?.title ?? row.slug,
        description:
          row.meta_description ??
          (content.meta as { description?: string })?.description ??
          '',
        robots:
          (content.meta as { robots?: string })?.robots ?? 'index, follow',
      },
    } as ComparePageDocument;

    validateComparePageDocument(pageDocument);

    const gaps = Array.isArray(row.content.data_gaps)
      ? row.content.data_gaps.filter((gap): gap is string => typeof gap === 'string')
      : [];

    if (gaps.length) {
      dataGapsReport.push({ slug: row.slug, gaps });
    }

    const outputPath = path.join(PAGES_DIR, `${row.slug}.json`);
    writeFileSync(outputPath, `${JSON.stringify(pageDocument, null, 2)}\n`, 'utf8');
    publishedSlugs.push(row.slug);
    console.log(`Exported ${outputPath}`);
  }

  const config = {
    defaultSlug: publishedSlugs.includes('remitly-vs-wise-vs-sliq-pay')
      ? 'remitly-vs-wise-vs-sliq-pay'
      : publishedSlugs[0],
    publishedSlugs,
  };

  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`Updated ${CONFIG_PATH}`);

  if (dataGapsReport.length) {
    console.log('\nData gaps for editorial review:');
    for (const entry of dataGapsReport) {
      console.log(`- ${entry.slug}:`);
      entry.gaps.forEach((gap) => console.log(`    • ${gap}`));
    }
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
