import 'dotenv/config';
import { ensureDocumentStoreIndexes, closeDocumentStore } from '../db/documentStore';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  await ensureDocumentStoreIndexes();
  console.log('MongoDB document store ready (knowledge_pages indexes ensured)');
  await closeDocumentStore();
}

main().catch(async (err) => {
  console.error(err);
  await closeDocumentStore().catch(() => undefined);
  process.exit(1);
});
