import { mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { db, pool } from '../db/knowledgeDB';
import { closeDocumentStore } from '../db/documentStore';
import { loadCompetitorBundle } from '../agents/comparePageBuilder';
import { extractProviderEvidence, buildSliqEvidence } from '../agents/compareEvidenceExtractor';

// Exports one ProviderEvidenceBundle JSON per competitor that has scraped +
// LLM-enriched data, plus the full competitors list (for the compare-page
// picker dropdown) and an index of which slugs actually have evidence ready.
// This is the data half of runtime compare-page assembly: Sliq-website reads
// these files and assembles a page for any two providers on demand, instead
// of every pair needing a separate compare:build + export:compare run.

const WEBSITE_ROOT = path.resolve(__dirname, '../../Sliq-website');
const PROVIDERS_DIR = path.join(WEBSITE_ROOT, 'src/content/compare/providers');
const COMPETITORS_PATH = path.join(WEBSITE_ROOT, 'src/content/compare/competitors.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  mkdirSync(PROVIDERS_DIR, { recursive: true });

  const { rows: allCompetitors } = await db.query<{ id: number; slug: string; name: string }>(
    `SELECT id, slug, name FROM competitors ORDER BY name`
  );
  writeFileSync(
    COMPETITORS_PATH,
    `${JSON.stringify(
      allCompetitors.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log(`Wrote ${allCompetitors.length} competitors -> ${COMPETITORS_PATH}`);

  const { rows: readyCompetitors } = await db.query<{ slug: string }>(
    `SELECT c.slug FROM competitors c
     JOIN competitor_metadata m ON m.competitor_id = c.id
     ORDER BY c.slug`
  );

  const availableSlugs: string[] = [];
  const failedSlugs: { slug: string; error: string }[] = [];

  for (const { slug } of readyCompetitors) {
    try {
      const bundle = await loadCompetitorBundle(slug);
      const evidence = extractProviderEvidence({
        id: bundle.slug,
        name: bundle.name,
        sheetMeta: bundle.sheetMeta,
        rawMetadata: bundle.rawMetadata,
        pages: bundle.pages,
        retrievedAt: bundle.retrievedAt,
      });
      writeFileSync(
        path.join(PROVIDERS_DIR, `${slug}.json`),
        `${JSON.stringify(evidence, null, 2)}\n`,
        'utf8'
      );
      availableSlugs.push(slug);
      console.log(`Wrote provider evidence for [${slug}]`);
    } catch (error) {
      failedSlugs.push({ slug, error: (error as Error).message });
      console.warn(`Skipped [${slug}]: ${(error as Error).message}`);
      // A competitor failing today's stricter/data-quality check shouldn't
      // vanish from the site's picker if it already has a working evidence
      // file from a past successful export — that page still renders fine
      // (Sliq-website reads providers/*.json directly, not gated on this
      // index), it's just not getting refreshed today. Keep it listed.
      if (existsSync(path.join(PROVIDERS_DIR, `${slug}.json`))) {
        availableSlugs.push(slug);
        console.log(`  (keeping previously-exported evidence for [${slug}])`);
      }
    }
  }

  const sliqEvidence = buildSliqEvidence();
  writeFileSync(
    path.join(PROVIDERS_DIR, 'sliq.json'),
    `${JSON.stringify(sliqEvidence, null, 2)}\n`,
    'utf8'
  );

  writeFileSync(
    path.join(PROVIDERS_DIR, '_index.json'),
    `${JSON.stringify({ availableSlugs: availableSlugs.sort() }, null, 2)}\n`,
    'utf8'
  );
  console.log(`\nAvailable providers (${availableSlugs.length}): ${availableSlugs.join(', ')}`);

  if (failedSlugs.length) {
    console.log(`\nSkipped (governed-field override needed or missing data):`);
    for (const f of failedSlugs) console.log(`- ${f.slug}: ${f.error}`);
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
