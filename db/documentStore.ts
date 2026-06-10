import { MongoClient, type Db, type Collection } from 'mongodb';
import type { KnowledgePageDoc } from './knowledgePages';

export const KNOWLEDGE_PAGES_COLLECTION = 'knowledge_pages';

let client: MongoClient | null = null;
let db: Db | null = null;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }
  return uri;
}

export async function getDocumentDb(): Promise<Db> {
  if (!db) {
    client = new MongoClient(getMongoUri());
    await client.connect();
    db = client.db();
  }
  return db;
}

export async function getKnowledgePagesCollection(): Promise<Collection<KnowledgePageDoc>> {
  const database = await getDocumentDb();
  return database.collection<KnowledgePageDoc>(KNOWLEDGE_PAGES_COLLECTION);
}

export async function ensureDocumentStoreIndexes(): Promise<void> {
  const col = await getKnowledgePagesCollection();
  await col.createIndex({ competitorId: 1, url: 1 }, { unique: true });
  await col.createIndex({ competitorId: 1, scrapedAt: -1 });
}

export async function closeDocumentStore(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
