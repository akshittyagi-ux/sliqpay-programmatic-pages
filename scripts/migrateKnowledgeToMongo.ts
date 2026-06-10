import 'dotenv/config';
import { pool } from '../db/knowledgeDB';
import { closeDocumentStore, ensureDocumentStoreIndexes } from '../db/documentStore';
import { upsertKnowledgePage } from '../db/knowledgePages';

type LegacyRow = {
  competitor_id: number;
  url: string;
  title: string | null;
  raw_html: string | null;
  clean_text: string | null;
  scraped_at: Date | null;
};

async function main() {
  if (!process.env.DATABASE_URL || !process.env.MONGODB_URI) {
    console.error('DATABASE_URL and MONGODB_URI are required');
    process.exit(1);
  }

  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'knowledge_pages'
    ) AS exists
  `);

  if (!tableCheck.rows[0]?.exists) {
    console.log('No legacy knowledge_pages table in PostgreSQL — nothing to migrate.');
    await pool.end();
    return;
  }

  const { rows } = await pool.query<LegacyRow>(`
    SELECT competitor_id, url, title, raw_html, clean_text, scraped_at
    FROM knowledge_pages
    ORDER BY competitor_id, url
  `);

  if (rows.length === 0) {
    console.log('knowledge_pages table is empty — nothing to migrate.');
    await pool.end();
    return;
  }

  await ensureDocumentStoreIndexes();

  let migrated = 0;
  for (const row of rows) {
    if (!row.raw_html || !row.clean_text) continue;

    await upsertKnowledgePage({
      competitorId: row.competitor_id,
      url: row.url,
      title: row.title,
      rawHtml: row.raw_html,
      cleanText: row.clean_text,
    });
    migrated++;
  }

  console.log(`Migrated ${migrated}/${rows.length} pages to MongoDB (knowledge_pages collection).`);
  console.log('Optional: DROP TABLE knowledge_pages; in PostgreSQL after verifying Mongo data.');

  await pool.end();
  await closeDocumentStore();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  await closeDocumentStore().catch(() => undefined);
  process.exit(1);
});
