import { MongoClient } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import dotenv from 'dotenv';
import CloudflareEmbeddings from './CloudflareEmbeddings';

dotenv.config();

let cachedVectorStore: any = (global as any).__vector_store__ || null;

async function getMongoCollection() {
  const mongoUri = process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('ADMIN_MONGO_URI or MONGODB_URI must be set');

  const client = new MongoClient(mongoUri);
  await client.connect();
  
  // Extract database name from URI, fallback to 'test' if not specified
  const url = new URL(mongoUri);
  const dbName = url.pathname.replace('/', '') || 'test';
  
  // Use the database name from the URI, not hardcoded 'admin'
  const db = client.db(dbName);
  const collectionName = process.env.MONGO_DB_COLLECTION || 'embeddings';
  return db.collection(collectionName);
}

export async function getVectorStore() {
  if (cachedVectorStore) return cachedVectorStore;

  try {
    const embeddings = new CloudflareEmbeddings({
      model: process.env.CLOUDFLARE_EMBEDDING_MODEL || '@cf/baai/bge-small-en-v1.5',
    });

    const collection = await getMongoCollection();

    const vectorStore = new MongoDBAtlasVectorSearch(embeddings as any, {
      collection: collection as any,
      indexName: process.env.MONGO_VECTOR_INDEX || 'vector_embeddings',
      textKey: process.env.MONGO_VECTOR_TEXT_KEY || 'text',
      embeddingKey: process.env.MONGO_VECTOR_EMBEDDING_KEY || 'embedding',
    });

    (global as any).__vector_store__ = vectorStore;
    cachedVectorStore = vectorStore;
    return vectorStore;
  } catch (error) {
    console.error('Error initializing vector store:', error);
    throw new Error(`Failed to initialize vector store: ${error.message}`);
  }
}


