import { getKnowledgePagesCollection } from './documentStore';
import { isErrorPage } from '../agents/scraperContent';

export type KnowledgePageDoc = {
  competitorId: number;
  url: string;
  title: string | null;
  rawHtml: string;
  cleanText: string;
  scrapedAt: Date;
};

export type KnowledgePageSummary = {
  url: string;
  title: string | null;
  clean_text: string;
};

const FIELD_URL_PATTERNS: Record<string, RegExp> = {
  compliance: /legal|license|licen|regulat|compliance|fincen|msb|money-transmitter/i,
  security: /security|trust|safety|fraud|protect/i,
  support: /support|help|contact/i,
  cost: /pricing|fees|rates/i,
  fxRate: /pricing|fees|rates|exchange/i,
  speed: /pricing|send-money|transfer|delivery/i,
  builtFor: /send-money|transfer|remittance|india/i,
  transferMethods: /send-money|transfer|delivery|india/i,
};

function isUsablePage(page: Pick<KnowledgePageDoc, 'title' | 'cleanText'>): boolean {
  if (page.cleanText.length <= 80) return false;
  return !isErrorPage(page.title ?? '', page.cleanText);
}

/** Lower score = higher priority (matches former SQL ORDER BY). */
export function scoreUrlPriority(url: string): number {
  const lower = url.toLowerCase();
  if (
    lower.includes('legal') ||
    lower.includes('license') ||
    lower.includes('licen') ||
    lower.includes('regulat') ||
    lower.includes('compliance')
  ) {
    return 0;
  }
  if (lower.includes('pricing') || lower.includes('fees') || lower.includes('rates')) return 1;
  if (
    lower.includes('send-money') ||
    lower.includes('india') ||
    lower.includes('transfer')
  ) {
    return 2;
  }
  if (
    lower.includes('features') ||
    lower.includes('how') ||
    lower.includes('security') ||
    lower.includes('trust') ||
    lower.includes('safety')
  ) {
    return 3;
  }
  if (lower.includes('about') || lower.includes('faq') || lower.includes('help')) return 4;
  return 5;
}

function toSummary(page: KnowledgePageDoc): KnowledgePageSummary {
  return {
    url: page.url,
    title: page.title,
    clean_text: page.cleanText,
  };
}

function sortPages(pages: KnowledgePageDoc[]): KnowledgePageDoc[] {
  return [...pages].sort((a, b) => {
    const priorityDiff = scoreUrlPriority(a.url) - scoreUrlPriority(b.url);
    if (priorityDiff !== 0) return priorityDiff;
    return b.cleanText.length - a.cleanText.length;
  });
}

export async function upsertKnowledgePage(input: {
  competitorId: number;
  url: string;
  title: string | null;
  rawHtml: string;
  cleanText: string;
}): Promise<void> {
  const col = await getKnowledgePagesCollection();
  await col.updateOne(
    { competitorId: input.competitorId, url: input.url },
    {
      $set: {
        competitorId: input.competitorId,
        url: input.url,
        title: input.title,
        rawHtml: input.rawHtml,
        cleanText: input.cleanText,
        scrapedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function deleteKnowledgePage(competitorId: number, url: string): Promise<void> {
  const col = await getKnowledgePagesCollection();
  await col.deleteOne({ competitorId, url });
}

export async function countKnowledgePages(competitorId: number): Promise<number> {
  const col = await getKnowledgePagesCollection();
  return col.countDocuments({ competitorId });
}

export async function getPrioritizedKnowledgePages(
  competitorId: number,
  limit = 40
): Promise<KnowledgePageSummary[]> {
  const col = await getKnowledgePagesCollection();
  const pages = await col.find({ competitorId }).toArray();

  return sortPages(pages)
    .filter(isUsablePage)
    .slice(0, limit)
    .map(toSummary);
}

export async function getFieldTargetedKnowledgePages(
  competitorId: number,
  fields: string[],
  limitPerField = 3
): Promise<KnowledgePageSummary[]> {
  const col = await getKnowledgePagesCollection();
  const pages = await col.find({ competitorId }).toArray();
  const usable = sortPages(pages).filter(isUsablePage);
  const seen = new Set<string>();
  const selected: KnowledgePageSummary[] = [];

  for (const field of fields) {
    const pattern = FIELD_URL_PATTERNS[field];
    if (!pattern) continue;

    let count = 0;
    for (const page of usable) {
      if (!pattern.test(page.url) || seen.has(page.url)) continue;
      seen.add(page.url);
      selected.push(toSummary(page));
      count += 1;
      if (count >= limitPerField) break;
    }
  }

  return selected;
}

export async function getCompareKnowledgePages(
  competitorId: number,
  limit = 30
): Promise<KnowledgePageSummary[]> {
  const prioritized = await getPrioritizedKnowledgePages(competitorId, limit);
  const targeted = await getFieldTargetedKnowledgePages(competitorId, [
    'compliance',
    'security',
    'support',
    'cost',
    'fxRate',
    'speed',
    'builtFor',
    'transferMethods',
  ]);

  const seen = new Set<string>();
  const merged: KnowledgePageSummary[] = [];

  for (const page of [...targeted, ...prioritized]) {
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    merged.push(page);
  }

  return merged;
}

export async function deleteKnowledgePagesForCompetitor(competitorId: number): Promise<number> {
  const col = await getKnowledgePagesCollection();
  const result = await col.deleteMany({ competitorId });
  return result.deletedCount;
}
