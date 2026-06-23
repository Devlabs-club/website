import { MongoClient, ObjectId, type Collection, type Document } from 'mongodb';
import bcrypt from 'bcryptjs';
import type { RuntimeEnv } from './workosEnv';

export type AuthUser = {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
  accountType?: 'founder' | 'builder' | null;
  onboardingStatus?: string | null;
  avatarUrl?: string | null;
  oauthProvider?: string | null;
  oauthId?: string | null;
  createdAt?: Date;
};

function readEnv(key: string, runtime?: RuntimeEnv): string | undefined {
  const fromRuntime = runtime?.[key]?.trim();
  if (fromRuntime) return fromRuntime;
  if (typeof process !== 'undefined') {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof fromMeta === 'string' ? fromMeta.trim() : undefined;
}

function adminMongoUri(runtime?: RuntimeEnv): string {
  const uri = readEnv('ADMIN_MONGO_URI', runtime) || readEnv('MONGODB_URI', runtime);
  if (!uri) throw new Error('ADMIN_MONGO_URI or MONGODB_URI must be set');
  return uri;
}

const globalCache = globalThis as typeof globalThis & {
  __adminMongoClient?: { client: MongoClient | null; promise: Promise<MongoClient> | null };
};

async function getClient(runtime?: RuntimeEnv): Promise<MongoClient> {
  if (!globalCache.__adminMongoClient) {
    globalCache.__adminMongoClient = { client: null, promise: null };
  }
  const cache = globalCache.__adminMongoClient;

  if (cache.client) return cache.client;

  if (!cache.promise) {
    const client = new MongoClient(adminMongoUri(runtime));
    cache.promise = client.connect().then((connected) => {
      cache.client = connected;
      return connected;
    });
  }

  return cache.promise;
}

async function usersCollection(runtime?: RuntimeEnv): Promise<Collection<Document>> {
  const client = await getClient(runtime);
  const db = client.db();
  return db.collection('users');
}

async function applicationsCollection(runtime?: RuntimeEnv): Promise<Collection<Document>> {
  const client = await getClient(runtime);
  const db = client.db();
  return db.collection('applications');
}

function toAuthUser(doc: Document | null): AuthUser | null {
  if (!doc || !doc._id) return null;
  return {
    _id: doc._id as ObjectId,
    name: String(doc.name ?? ''),
    email: String(doc.email ?? ''),
    role: String(doc.role ?? 'user'),
    accountType: (doc.accountType as 'founder' | 'builder' | null | undefined) ?? null,
    onboardingStatus: (doc.onboardingStatus as string | null | undefined) ?? null,
    avatarUrl: (doc.avatarUrl as string | null | undefined) ?? null,
    oauthProvider: doc.oauthProvider as string | null | undefined,
    oauthId: doc.oauthId as string | null | undefined,
    createdAt: doc.createdAt as Date | undefined,
  };
}

export async function findUserByEmail(
  email: string,
  runtime?: RuntimeEnv
): Promise<AuthUser | null> {
  const users = await usersCollection(runtime);
  const doc = await users.findOne({ email: email.toLowerCase() });
  return toAuthUser(doc);
}

export async function verifyUserPassword(
  email: string,
  candidatePassword: string,
  runtime?: RuntimeEnv
): Promise<AuthUser | null> {
  const users = await usersCollection(runtime);
  const doc = await users.findOne({ email: email.toLowerCase() });
  if (!doc?.password) return null;
  const valid = await bcrypt.compare(candidatePassword, String(doc.password));
  if (!valid) return null;
  return toAuthUser(doc);
}

export async function findUserById(
  userId: string,
  runtime?: RuntimeEnv
): Promise<AuthUser | null> {
  const users = await usersCollection(runtime);
  const doc = await users.findOne({ _id: new ObjectId(userId) });
  return toAuthUser(doc);
}

export async function findApplicationResumeUrl(
  userId: string,
  runtime?: RuntimeEnv
): Promise<string | null> {
  const apps = await applicationsCollection(runtime);
  const doc = await apps.findOne({ user: new ObjectId(userId) });
  return doc?.resumeUrl ? String(doc.resumeUrl) : null;
}

export async function upsertUserFromOAuth(
  input: {
    email: string;
    name: string;
    oauthId: string;
    provider?: 'google';
    avatarUrl?: string | null;
  },
  runtime?: RuntimeEnv
): Promise<AuthUser> {
  const users = await usersCollection(runtime);
  const email = input.email.toLowerCase();
  const provider = input.provider ?? 'google';
  const existing = await users.findOne({ email });

  if (existing) {
    const update: Document = {
      name: input.name,
      updatedAt: new Date(),
    };
    if (input.avatarUrl && !existing.avatarUrl) {
      update.avatarUrl = input.avatarUrl;
    }
    if (!existing.oauthProvider) {
      update.oauthProvider = provider;
      update.oauthId = input.oauthId;
    }
    await users.updateOne({ _id: existing._id }, { $set: update });
    const updated = await users.findOne({ _id: existing._id });
    const user = toAuthUser(updated);
    if (!user) throw new Error('Failed to load user after update');
    return user;
  }

  const randomPassword = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(randomPassword, 12);
  const now = new Date();
  const insert = {
    name: input.name,
    email,
    password: hashedPassword,
    role: 'user',
    accountType: null,
    onboardingStatus: null,
    avatarUrl: input.avatarUrl ?? null,
    oauthProvider: provider,
    oauthId: input.oauthId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await users.insertOne(insert);
  const user = toAuthUser({ _id: result.insertedId, ...insert });
  if (!user) throw new Error('Failed to load user after insert');
  return user;
}

/**
 * Update mutable account fields (account type, onboarding status, role, profile basics).
 * Used by the role-selection screen and onboarding steps.
 */
export async function updateUserAccount(
  userId: string,
  fields: Partial<{
    accountType: 'founder' | 'builder' | null;
    onboardingStatus: string | null;
    role: string;
    name: string;
    avatarUrl: string | null;
  }>,
  runtime?: RuntimeEnv
): Promise<AuthUser | null> {
  const users = await usersCollection(runtime);
  const update: Document = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) update[key] = value;
  }
  await users.updateOne({ _id: new ObjectId(userId) }, { $set: update });
  const updated = await users.findOne({ _id: new ObjectId(userId) });
  return toAuthUser(updated);
}
