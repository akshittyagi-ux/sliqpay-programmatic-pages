import { db } from '../db/knowledgeDB';
import { getCompareKnowledge, getSheetMetadata } from './competitorContext';
import type { ComparePageDocument } from './comparePageTypes';
import { assembleComparePageDocument } from './comparePageAssembler';
import { buildSliqEvidence, extractProviderEvidence } from './compareEvidenceExtractor';
import { enrichBundlesWithPricingQuotes } from './comparePricingQuotes';
import { validateComparePageDocument } from './compareValidation';
import { ensureCompetitorAssets, hasExistingAssets } from './competitorAssets';

type CompetitorBundle = {
  id: number;
  slug: string;
  name: string;
  websiteUrl: string | null;
  sheetMeta: Record<string, string>;
  rawMetadata: Record<string, unknown>;
  pages: { url: string; title: string | null; clean_text: string }[];
};

const DEFAULT_CORRIDOR = {
  sendCurrency: 'USD',
  receiveCurrency: 'INR',
  payinRail: 'ACH',
  payoutRail: 'UPI',
  receiveAmount: 100,
};

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.length > 0 &&
      normalized !== 'null' &&
      normalized !== 'unknown' &&
      normalized !== 'not stated' &&
      normalized !== 'not found'
    );
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function mergeStructuredMetadata(
  rawMetadata: Record<string, unknown>,
  row: {
    service_type: string | null;
    fee_structure: string | null;
    transfer_speed: string | null;
    delivery_methods: string[] | null;
    is_regulated: boolean | null;
    regulation_bodies: string[] | null;
  }
): Record<string, unknown> {
  const merged = { ...rawMetadata };

  if (!isPresent(merged.service_type) && row.service_type) {
    merged.service_type = row.service_type;
  }
  if (!isPresent(merged.fee_structure) && row.fee_structure) {
    merged.fee_structure = row.fee_structure;
  }
  if (!isPresent(merged.transfer_speed) && row.transfer_speed) {
    merged.transfer_speed = row.transfer_speed;
  }
  if (!isPresent(merged.delivery_methods) && row.delivery_methods?.length) {
    merged.delivery_methods = row.delivery_methods;
  }
  if (!isPresent(merged.is_regulated) && row.is_regulated !== null) {
    merged.is_regulated = row.is_regulated;
  }
  if (!isPresent(merged.regulation_bodies) && row.regulation_bodies?.length) {
    merged.regulation_bodies = row.regulation_bodies;
  }

  return merged;
}

export async function loadCompetitorBundle(slug: string): Promise<CompetitorBundle> {
  const { rows } = await db.query<{
    id: number;
    slug: string;
    name: string;
    website_url: string | null;
  }>(`SELECT id, slug, name, website_url FROM competitors WHERE slug = $1`, [slug]);

  const competitor = rows[0];
  if (!competitor) {
    throw new Error(`Competitor not found for slug: ${slug}`);
  }

  const pages = await getCompareKnowledge(competitor.id, 30);
  const sheetMeta = await getSheetMetadata(competitor.id);

  const { rows: metaRows } = await db.query<{
    service_type: string | null;
    fee_structure: string | null;
    transfer_speed: string | null;
    delivery_methods: string[] | null;
    is_regulated: boolean | null;
    regulation_bodies: string[] | null;
    raw_metadata: Record<string, unknown>;
  }>(
    `SELECT service_type, fee_structure, transfer_speed, delivery_methods,
            is_regulated, regulation_bodies, raw_metadata
     FROM competitor_metadata WHERE competitor_id = $1`,
    [competitor.id]
  );

  const metaRow = metaRows[0];

  return {
    id: competitor.id,
    slug: competitor.slug,
    name: competitor.name,
    websiteUrl: competitor.website_url,
    sheetMeta,
    rawMetadata: mergeStructuredMetadata(metaRow?.raw_metadata ?? {}, {
      service_type: metaRow?.service_type ?? null,
      fee_structure: metaRow?.fee_structure ?? null,
      transfer_speed: metaRow?.transfer_speed ?? null,
      delivery_methods: metaRow?.delivery_methods ?? null,
      is_regulated: metaRow?.is_regulated ?? null,
      regulation_bodies: metaRow?.regulation_bodies ?? null,
    }),
    pages,
  };
}

export async function buildComparePage(slug: string, providerSlugs: string[]) {
  if (!providerSlugs.length) {
    throw new Error('At least one competitor slug is required');
  }

  const bundles = await Promise.all(providerSlugs.map((providerSlug) => loadCompetitorBundle(providerSlug)));

  for (const bundle of bundles) {
    if (hasExistingAssets(bundle.slug)) continue; // never touch hand-placed pilot assets
    if (!bundle.websiteUrl) {
      console.warn(`Skipping asset fetch for "${bundle.slug}" — no website_url on file.`);
      continue;
    }
    try {
      const result = await ensureCompetitorAssets(bundle.slug, bundle.websiteUrl);
      if (result === 'created') {
        console.log(`Fetched and generated logo assets for "${bundle.slug}".`);
      }
    } catch (error) {
      console.warn(`Could not fetch logo assets for "${bundle.slug}": ${(error as Error).message}`);
    }
  }

  const competitorEvidence = bundles.map((bundle) =>
    extractProviderEvidence({
      id: bundle.slug,
      name: bundle.name,
      sheetMeta: bundle.sheetMeta,
      rawMetadata: bundle.rawMetadata,
      pages: bundle.pages,
    })
  );

  const sliqBundle = buildSliqEvidence();
  const pricedBundles = await enrichBundlesWithPricingQuotes(
    [...competitorEvidence, sliqBundle],
    DEFAULT_CORRIDOR
  );
  const pricedCompetitorBundles = pricedBundles.slice(0, competitorEvidence.length);
  const pricedSliqBundle = pricedBundles[pricedBundles.length - 1];

  const content: ComparePageDocument = assembleComparePageDocument({
    slug,
    competitorBundles: pricedCompetitorBundles,
    sliqBundle: pricedSliqBundle,
    corridor: DEFAULT_CORRIDOR,
  });

  validateComparePageDocument(content);

  await db.query(
    `
    INSERT INTO compare_pages (slug, provider_slugs, content, meta_title, meta_description)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (slug) DO UPDATE
    SET provider_slugs = $2,
        content = $3,
        meta_title = $4,
        meta_description = $5,
        generated_at = NOW(),
        needs_refresh = FALSE
  `,
    [
      slug,
      providerSlugs,
      content,
      content.meta?.title ?? null,
      content.meta?.description ?? null,
    ]
  );

  console.log(
    `Built compare page [${slug}] with ${content.validation.requiredEvidenceCount} evidence records`
  );

  return content;
}
