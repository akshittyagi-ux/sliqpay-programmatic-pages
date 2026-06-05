import { db } from '../db/finalInfoDB';

/** Mark pages that need regeneration after a competitor refresh. */
export async function markPagesForRefresh(competitorId: number) {
  await db.query(
    `UPDATE page_content SET needs_refresh = TRUE WHERE competitor_id = $1`,
    [competitorId]
  );
}

export async function getPageContentStats() {
  const { rows } = await db.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM page_content`
  );
  return { totalPages: parseInt(rows[0]?.total ?? '0', 10) };
}
