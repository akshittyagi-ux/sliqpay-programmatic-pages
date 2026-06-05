/**
 * Canonical page types per competitor. IDs are used in DB (page_type) and URLs.
 * Titles match product naming exactly (use formatPageTitle() with competitor name).
 */
export const PAGE_TYPE_DEFINITIONS = [
  {
    id: 'sliqpay-vs-competitor',
    titleTemplate: 'Sliq pay vs {competitor}',
    promptFile: 'vs-competitor.txt',
  },
  {
    id: 'which-is-cheaper',
    titleTemplate: 'Which is cheaper: Sliq pay or {competitor}',
    promptFile: 'cheaper.txt',
  },
  {
    id: 'which-is-faster',
    titleTemplate: 'Which is faster: Sliq pay or {competitor}',
    promptFile: 'faster.txt',
  },
  {
    id: 'which-is-safer',
    titleTemplate: 'Which is safer: Sliq pay or {competitor}',
    promptFile: 'safer.txt',
  },
  {
    id: 'which-is-more-convenient',
    titleTemplate: 'Which is more convenient: Sliq pay or {competitor}',
    promptFile: 'convenient.txt',
  },
  {
    id: 'which-is-better-for-tourists-visiting-india',
    titleTemplate: 'Which is better for tourists visiting India: Sliq pay or {competitor}',
    promptFile: 'tourists.txt',
  },
  {
    id: 'which-is-better-for-nris',
    titleTemplate: 'Which is better for NRIs: Sliq pay or {competitor}',
    promptFile: 'nri.txt',
  },
  {
    id: 'competitor-alternative-sliqpay',
    titleTemplate: '{competitor} alternative: Sliq pay',
    promptFile: 'alternative.txt',
  },
] as const;

export type PageTypeId = (typeof PAGE_TYPE_DEFINITIONS)[number]['id'];

export const PAGE_TYPES: PageTypeId[] = PAGE_TYPE_DEFINITIONS.map((p) => p.id);

const byId = new Map(PAGE_TYPE_DEFINITIONS.map((p) => [p.id, p]));

export function getPageTypeDefinition(id: string) {
  return byId.get(id as PageTypeId);
}

export function formatPageTitle(id: string, competitorName: string): string {
  const def = getPageTypeDefinition(id);
  if (!def) return competitorName;
  return def.titleTemplate.replace(/\{competitor\}/g, competitorName);
}

export function isValidPageType(id: string): id is PageTypeId {
  return byId.has(id as PageTypeId);
}

/** @deprecated Old pipeline IDs — map to new IDs if migrating existing rows */
export const LEGACY_PAGE_TYPE_MAP: Record<string, PageTypeId> = {
  vs: 'sliqpay-vs-competitor',
  cheaper: 'which-is-cheaper',
  faster: 'which-is-faster',
  safer: 'which-is-safer',
  convenient: 'which-is-more-convenient',
  tourists: 'which-is-better-for-tourists-visiting-india',
  nri: 'which-is-better-for-nris',
  alternative: 'competitor-alternative-sliqpay',
};
