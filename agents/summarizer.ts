import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { db } from '../db/knowledgeDB';
import { generateJson } from './llm';
import {
  PAGE_TYPES,
  PAGE_TYPE_DEFINITIONS,
  formatPageTitle,
  type PageTypeId,
  isValidPageType,
} from './pageTypes';
import {
  getSheetMetadata,
  getPrioritizedKnowledge,
  formatSheetMetadataForPrompt,
  formatKnowledgeForPrompt,
  COMPARISON_DATA_RULES,
} from './competitorContext';

export { PAGE_TYPES, formatPageTitle, isValidPageType };
export type { PageTypeId };

const SLIQPAY_FACTS = `
SliqPay facts:
- Mid-market USD to INR rate, zero markup
- Zero India-side fees
- Supports NRE, NRO, Savings, Current accounts
- IMPS, UPI, NEFT, RTGS delivery rails
- Transfer limit: up to $1,000,000
- FinCEN registered (NMLS #2714589), RBI compliant
- 24/7 support: phone, email, live chat
- Transfer speed: instant via IMPS/UPI
`.trim();

function loadPagePrompt(promptFile: string): string {
  const promptPath = path.join(__dirname, '../prompts/summarizer', promptFile);
  if (!existsSync(promptPath)) {
    throw new Error(`Missing prompt file: ${promptFile}`);
  }
  return readFileSync(promptPath, 'utf8');
}

type PageContentJson = {
  meta_title?: string;
  meta_description?: string;
  page_title?: string;
  data_gaps?: string[];
  [key: string]: unknown;
};

export async function summarizeForPageType(
  competitorId: number,
  competitorName: string,
  pageType: PageTypeId
) {
  const def = PAGE_TYPE_DEFINITIONS.find((p) => p.id === pageType);
  if (!def) {
    throw new Error(`Unknown page type: ${pageType}`);
  }

  const pageTitle = formatPageTitle(pageType, competitorName);
  const pages = await getPrioritizedKnowledge(competitorId, 40);
  const sheetMeta = await getSheetMetadata(competitorId);

  const { rows: metaRows } = await db.query<{ raw_metadata: Record<string, unknown> }>(
    `SELECT raw_metadata FROM competitor_metadata WHERE competitor_id = $1`,
    [competitorId]
  );

  const knowledgeText = formatKnowledgeForPrompt(pages, 70_000);
  const metadata = metaRows[0]?.raw_metadata ?? {};
  const pagePrompt = loadPagePrompt(def.promptFile);

  const content = await generateJson<PageContentJson>({
    prompt: `You are building content for SliqPay's programmatic comparison page.

Competitor: ${competitorName}
Page title (use exactly for meta_title and hero.headline): ${pageTitle}

${COMPARISON_DATA_RULES}

Manager sheet metadata:
${formatSheetMetadataForPrompt(sheetMeta)}

Structured competitor metadata (from prior enrichment step):
${JSON.stringify(metadata, null, 2)}

${SLIQPAY_FACTS}

${pagePrompt}

Return ONLY valid JSON. No markdown. No preamble.
Set meta_title to the page title above (or a close SEO variant under 60 characters).
Set page_title to the exact page title above.
Populate comparison_table_rows / score_cards with verified competitor data only.
Use "Not stated" where competitor data is missing — do not guess.

Scraped competitor website content (${pages.length} pages):
${knowledgeText}`,
    maxTokens: 5000,
  });

  if (!content.page_title) {
    content.page_title = pageTitle;
  }
  if (!content.meta_title) {
    content.meta_title = pageTitle;
  }

  await db.query(
    `
    INSERT INTO page_content (competitor_id, page_type, content, meta_title, meta_description)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (competitor_id, page_type) DO UPDATE
    SET content = $3, meta_title = $4, meta_description = $5,
        generated_at = NOW(), needs_refresh = FALSE
  `,
    [
      competitorId,
      pageType,
      content,
      content.meta_title ?? null,
      content.meta_description ?? null,
    ]
  );

  const gaps = content.data_gaps?.length ?? 0;
  console.log(`Summarized [${pageTitle}] for ${competitorName}${gaps ? ` (${gaps} data gaps noted)` : ''}`);
}

export async function summarizeAllPageTypes(competitorId: number, competitorName: string) {
  for (const pageType of PAGE_TYPES) {
    await summarizeForPageType(competitorId, competitorName, pageType);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
