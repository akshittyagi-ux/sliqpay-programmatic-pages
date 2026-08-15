// Quick lookup: is a competitor scraped + metadata-enriched yet, i.e. ready
// to be used as a provider_slug in data/compare-pages.csv?
//
// Usage:
//   npm run competitors:status                 -> full pipeline-readiness summary
//   npm run competitors:status -- paypal        -> search by name/slug substring
//   npm run competitors:status -- --ids 113,122 -> look up specific ids
import 'dotenv/config';
import { pool } from '../db/pool';
import { getKnowledgePagesCollection, closeDocumentStore } from '../db/documentStore';

async function main() {
  const args = process.argv.slice(2);
  const idsArg = args.find((a) => a === '--ids');
  const ids = idsArg
    ? args[args.indexOf(idsArg) + 1].split(',').map((s) => parseInt(s.trim(), 10))
    : null;
  const search = !ids ? args.find((a) => !a.startsWith('--')) : null;

  if (!ids && !search) {
    const total = await pool.query(`select count(*)::int as n from competitors`);
    const byStatus = await pool.query(
      `select scrape_status, count(*)::int as n from competitors group by scrape_status order by n desc`
    );
    const withMeta = await pool.query(
      `select count(distinct competitor_id)::int as n from competitor_metadata`
    );
    console.log(`Total competitors (seeded from sheet): ${total.rows[0].n}`);
    console.log(`By scrape_status:`, byStatus.rows);
    console.log(`Competitors with metadata enriched (ready for compare:build): ${withMeta.rows[0].n}`);
    console.log(`\nRun with a name/slug to see details, e.g.: npm run competitors:status -- paypal`);
    await pool.end();
    await closeDocumentStore();
    return;
  }

  const where = ids ? `c.id = ANY($1)` : `(c.name ILIKE $1 OR c.slug ILIKE $1)`;
  const param: unknown[] = ids ? [ids] : [`%${search}%`];
  const { rows } = await pool.query<{
    id: number;
    name: string;
    slug: string;
    website_url: string;
    scrape_status: string;
    has_metadata: boolean;
  }>(
    `select c.id, c.name, c.slug, c.website_url, c.scrape_status,
            m.id is not null as has_metadata
     from competitors c
     left join competitor_metadata m on m.competitor_id = c.id
     where ${where}
     order by c.name
     limit 25`,
    param
  );

  if (rows.length === 0) {
    console.log('No matching competitors found.');
    await pool.end();
    await closeDocumentStore();
    return;
  }

  const col = await getKnowledgePagesCollection();
  for (const r of rows) {
    const pageCount = await col.countDocuments({ competitorId: r.id });
    const ready = r.scrape_status === 'done' && r.has_metadata;
    console.log(
      `${ready ? 'READY' : 'NOT READY'}  id=${r.id}  slug=${r.slug}  "${r.name}"  ` +
        `scrape_status=${r.scrape_status}  pages_scraped=${pageCount}  has_metadata=${r.has_metadata}`
    );
    if (!ready) {
      if (r.scrape_status !== 'done') {
        console.log(`  -> run: npm run pipeline -- --ids ${r.id} --scrape-only`);
      }
      if (!r.has_metadata) {
        console.log(`  -> run: npm run pipeline -- --ids ${r.id} --metadata-only`);
      }
    }
  }

  await pool.end();
  await closeDocumentStore();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
