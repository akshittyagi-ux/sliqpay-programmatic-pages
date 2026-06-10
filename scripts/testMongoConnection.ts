import 'dotenv/config';
import { closeDocumentStore, getDocumentDb } from '../db/documentStore';
import { countKnowledgePages } from '../db/knowledgePages';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is missing from .env');
    process.exit(1);
  }

  let parsed: URL;
  try {
    parsed = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:'));
  } catch {
    console.error('MONGODB_URI is not a valid URL');
    process.exit(1);
  }

  console.log('Testing MongoDB connection...');
  console.log(`  Host: ${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`);
  console.log(`  Database: ${parsed.pathname.slice(1) || '(default)'}`);

  try {
    const db = await getDocumentDb();
    const ping = await db.command({ ping: 1 });
    const totalPages = await db.collection('knowledge_pages').countDocuments();

    console.log('\nConnected successfully.');
    console.log(`  Ping: ${ping.ok === 1 ? 'ok' : 'failed'}`);
    console.log(`  knowledge_pages documents: ${totalPages}`);

    if (process.argv.includes('--competitor-id')) {
      const idx = process.argv.indexOf('--competitor-id');
      const competitorId = parseInt(process.argv[idx + 1], 10);
      if (!Number.isNaN(competitorId)) {
        const count = await countKnowledgePages(competitorId);
        console.log(`  Pages for competitor ${competitorId}: ${count}`);
      }
    }
  } catch (err: unknown) {
    console.error('\nConnection failed:', err instanceof Error ? err.message : err);
    console.error(`
Ensure MongoDB is running and MONGODB_URI is set, for example:
  MONGODB_URI=mongodb://localhost:27017/sliqpay_knowledge

Then run:
  npm run db:document-store
`);
    process.exit(1);
  } finally {
    await closeDocumentStore();
  }
}

main();
