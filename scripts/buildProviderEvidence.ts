import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { loadCompetitorBundle } from '../agents/comparePageBuilder';
import { extractProviderEvidence } from '../agents/compareEvidenceExtractor';
import { pool } from '../db/knowledgeDB';
import { closeDocumentStore } from '../db/documentStore';

// Produces one JSON file per competitor slug containing its full field-by-field
// evidence bundle (ProviderEvidenceBundle), independent of any pairing partner.
// This is the "ready to inject" data referenced when assembling a compare page
// for an arbitrary competitor1-vs-competitor2-vs-sliq combination at runtime.

const OUTPUT_DIR = path.join(__dirname, '../data/provider-evidence');

function parseArgs() {
  const args = process.argv.slice(2);
  const slugsArg = args.find((a) => a.startsWith('--slugs='));
  const slugs = slugsArg
    ? slugsArg.replace('--slugs=', '').split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return { slugs };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const { slugs } = parseArgs();
  if (!slugs.length) {
    console.error('Usage: ts-node scripts/buildProviderEvidence.ts --slugs=aspora-formerly-vance,instarem-nium');
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const slug of slugs) {
    const bundle = await loadCompetitorBundle(slug);
    const evidence = extractProviderEvidence({
      id: bundle.slug,
      name: bundle.name,
      sheetMeta: bundle.sheetMeta,
      rawMetadata: bundle.rawMetadata,
      pages: bundle.pages,
      retrievedAt: bundle.retrievedAt,
    });

    const outPath = path.join(OUTPUT_DIR, `${slug}.json`);
    writeFileSync(outPath, JSON.stringify(evidence, null, 2));

    console.log(`Wrote ${evidence.evidence.length} evidence fields for [${slug}] -> ${outPath}`);
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
