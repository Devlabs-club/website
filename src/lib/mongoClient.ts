import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const clientCache = (globalThis as any).__mongoClient__ ?? ((globalThis as any).__mongoClient__ = { client: null, promise: null });

export async function getMongoClient(): Promise<MongoClient> {
  if (clientCache.client) return clientCache.client as MongoClient;

  if (!clientCache.promise) {
    const mongoUri = process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('ADMIN_MONGO_URI or MONGODB_URI must be set');
    if (process.env.DEBUG_DB === '1') console.log(`[DB] Creating native MongoClient to ${mongoUri}`);
    const client = new MongoClient(mongoUri);
    clientCache.promise = client.connect().then(() => client);
  }

  try {
    clientCache.client = await clientCache.promise;
  } catch (e) {
    clientCache.promise = null;
    throw e;
  }
  return clientCache.client as MongoClient;
}

export async function getDb(dbName?: string) {
  const client = await getMongoClient();
  if (dbName) return client.db(dbName);

  const mongoUri = process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
  const url = new URL(mongoUri as string);
  const inferred = url.pathname.replace('/', '') || 'test';
  return client.db(inferred);
}

export async function getCollection<TSchema extends object = any>(collectionName: string, dbName?: string) {
  const db = await getDb(dbName);
  return db.collection<TSchema>(collectionName);
}
