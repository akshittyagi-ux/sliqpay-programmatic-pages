import { db } from '../db/knowledgeDB';

export type SheetMetadata = Record<string, string>;

export async function getSheetMetadata(competitorId: number): Promise<SheetMetadata> {
  const { rows } = await db.query<{ sheet_metadata: SheetMetadata | null }>(
    `SELECT sheet_metadata FROM competitors WHERE id = $1`,
    [competitorId]
  );
  return rows[0]?.sheet_metadata ?? {};
}

const KNOWLEDGE_URL_PRIORITY = `
  ORDER BY
    CASE
      WHEN url ILIKE '%pricing%' THEN 1
      WHEN url ILIKE '%fees%' THEN 1
      WHEN url ILIKE '%rates%' THEN 1
      WHEN url ILIKE '%send-money%' THEN 2
      WHEN url ILIKE '%india%' THEN 2
      WHEN url ILIKE '%transfer%' THEN 2
      WHEN url ILIKE '%features%' THEN 3
      WHEN url ILIKE '%how%' THEN 3
      WHEN url ILIKE '%security%' THEN 3
      WHEN url ILIKE '%trust%' THEN 3
      WHEN url ILIKE '%about%' THEN 4
      WHEN url ILIKE '%faq%' THEN 4
      WHEN url ILIKE '%help%' THEN 4
      ELSE 5
    END,
    LENGTH(clean_text) DESC
`;

export async function getPrioritizedKnowledge(
  competitorId: number,
  limit = 40
): Promise<{ url: string; title: string | null; clean_text: string }[]> {
  const { rows } = await db.query<{ url: string; title: string | null; clean_text: string }>(
    `
    SELECT url, title, clean_text FROM knowledge_pages
    WHERE competitor_id = $1 AND LENGTH(clean_text) > 80
    ${KNOWLEDGE_URL_PRIORITY}
    LIMIT $2
  `,
    [competitorId, limit]
  );
  return rows;
}

export function formatSheetMetadataForPrompt(meta: SheetMetadata): string {
  const entries = Object.entries(meta).filter(([, v]) => v && v.trim());
  if (entries.length === 0) return '(none)';
  return entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
}

export function formatKnowledgeForPrompt(
  pages: { url: string; title: string | null; clean_text: string }[],
  charLimit = 90_000
): string {
  let total = 0;
  const chunks: string[] = [];

  for (const p of pages) {
    const chunk = `URL: ${p.url}\nTitle: ${p.title ?? ''}\n${p.clean_text}`;
    if (total + chunk.length > charLimit) break;
    chunks.push(chunk);
    total += chunk.length;
  }

  return chunks.join('\n\n---\n\n');
}

export const COMPARISON_DATA_RULES = `
Data rules (critical):
- Use ONLY facts from: (1) manager sheet metadata, (2) scraped website content, (3) structured competitor_metadata.
- For each competitor claim in comparison tables, use real values or state "Not stated" / "Not found in sources".
- NEVER invent fees, speeds, regulation, or limits for the competitor.
- When sheet metadata and website conflict, prefer website for live pricing; note discrepancy in data_gaps if present.
- Include a top-level "data_gaps" string array listing comparison fields you could not verify.
- SliqPay facts below are authoritative for SliqPay side only.
`.trim();
