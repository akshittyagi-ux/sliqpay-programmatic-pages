import { getKnowledgePagesCollection } from './documentStore';

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

/** Lower score = higher priority (matches former SQL ORDER BY). */
export function scoreUrlPriority(url: string): number {
  const lower = url.toLowerCase();
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
    lower.includes('trust')
  ) {
    return 3;
  }
  if (lower.includes('about') || lower.includes('faq') || lower.includes('help')) return 4;
  return 5;
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

  return pages
    .filter((p) => p.cleanText.length > 80)
    .sort((a, b) => {
      const priorityDiff = scoreUrlPriority(a.url) - scoreUrlPriority(b.url);
      if (priorityDiff !== 0) return priorityDiff;
      return b.cleanText.length - a.cleanText.length;
    })
    .slice(0, limit)
    .map((p) => ({
      url: p.url,
      title: p.title,
      clean_text: p.cleanText,
    }));
}

export async function deleteKnowledgePagesForCompetitor(competitorId: number): Promise<number> {
  const col = await getKnowledgePagesCollection();
  const result = await col.deleteMany({ competitorId });
  return result.deletedCount;
}
