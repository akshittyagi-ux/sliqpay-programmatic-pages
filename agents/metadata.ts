import { readFileSync } from 'fs';
import path from 'path';
import { db } from '../db/knowledgeDB';
import { generateJson } from './llm';
import {
  getSheetMetadata,
  getPrioritizedKnowledge,
  formatSheetMetadataForPrompt,
  formatKnowledgeForPrompt,
} from './competitorContext';

type MetadataJson = {
  service_type?: string;
  transfer_rails?: string[];
  geo_coverage?: string[];
  supported_currencies?: string[];
  fee_structure?: string;
  transfer_speed?: string;
  delivery_methods?: string[];
  has_mobile_app?: boolean;
  has_business_account?: boolean;
  founded_year?: number | null;
  headquarters?: string;
  is_regulated?: boolean;
  regulation_bodies?: string[];
  data_gaps?: string[];
  audience_segments?: {
    expats?: boolean;
    businesses?: boolean;
    freelancers?: boolean;
    tourists?: boolean;
  };
  audience_segments_quote?: string;
  fee_pct_signal?: '1%' | '1-2%' | '2-3%' | '3-4%' | '4%+' | null;
  fee_pct_quote?: string;
  mid_market_rate_mentioned?: boolean;
  mid_market_rate_quote?: string;
  speed_signal?: 'fast_transfer' | 'same_or_next_business_day' | 'standard_3_5_days' | 'not_mentioned';
  speed_quote?: string;
  security_mentioned?: boolean;
  security_quote?: string;
  regulatory_signal?: {
    fincen_or_nmls_or_mtl_mentioned?: boolean;
    crypto_or_stablecoin_mentioned?: boolean;
  };
  regulatory_quote?: string;
  [key: string]: unknown;
};

export async function enrichMetadata(competitorId: number) {
  const pages = await getPrioritizedKnowledge(competitorId, 25);

  if (pages.length === 0) {
    throw new Error(`No knowledge pages for competitor ${competitorId}`);
  }

  const sheetMeta = await getSheetMetadata(competitorId);
  const combinedText = formatKnowledgeForPrompt(pages, 80_000);

  const promptTemplate = readFileSync(
    path.join(__dirname, '../prompts/metadata.txt'),
    'utf8'
  );

  const metadata = await generateJson<MetadataJson>({
    prompt: `${promptTemplate}

Manager sheet metadata (use as supplemental source; do not invent beyond this + website):
${formatSheetMetadataForPrompt(sheetMeta)}

Website content:
${combinedText}`,
    maxTokens: 3500,
  });

  await db.query(
    `
    INSERT INTO competitor_metadata (
      competitor_id, service_type, transfer_rails, geo_coverage,
      supported_currencies, fee_structure, transfer_speed, delivery_methods,
      has_mobile_app, has_business_account, founded_year, headquarters,
      is_regulated, regulation_bodies, raw_metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (competitor_id) DO UPDATE SET
      service_type = EXCLUDED.service_type,
      transfer_rails = EXCLUDED.transfer_rails,
      geo_coverage = EXCLUDED.geo_coverage,
      supported_currencies = EXCLUDED.supported_currencies,
      fee_structure = EXCLUDED.fee_structure,
      transfer_speed = EXCLUDED.transfer_speed,
      delivery_methods = EXCLUDED.delivery_methods,
      has_mobile_app = EXCLUDED.has_mobile_app,
      has_business_account = EXCLUDED.has_business_account,
      founded_year = EXCLUDED.founded_year,
      headquarters = EXCLUDED.headquarters,
      is_regulated = EXCLUDED.is_regulated,
      regulation_bodies = EXCLUDED.regulation_bodies,
      raw_metadata = EXCLUDED.raw_metadata,
      updated_at = NOW()
  `,
    [
      competitorId,
      metadata.service_type ?? null,
      metadata.transfer_rails ?? null,
      metadata.geo_coverage ?? null,
      metadata.supported_currencies ?? null,
      metadata.fee_structure ?? null,
      metadata.transfer_speed ?? null,
      metadata.delivery_methods ?? null,
      metadata.has_mobile_app ?? null,
      metadata.has_business_account ?? null,
      metadata.founded_year ?? null,
      metadata.headquarters ?? null,
      metadata.is_regulated ?? null,
      metadata.regulation_bodies ?? null,
      metadata,
    ]
  );

  console.log(`Metadata enriched for competitor ${competitorId}`);
}
