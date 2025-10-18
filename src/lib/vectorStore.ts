import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import dotenv from 'dotenv';
import CloudflareEmbeddings from './CloudflareEmbeddings';
import { getDb } from './mongoClient';

dotenv.config();

let cachedVectorStore: any = (global as any).__vector_store__ || null;

async function getMongoCollection() {
  const db = await getDb();
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
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize vector store: ${msg}`);
  }
}


