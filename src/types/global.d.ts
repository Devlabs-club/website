import type mongoose from 'mongoose';
import type { MongoClient } from 'mongodb';

declare global {
  // Cached default Mongoose connection (app DB)
  var __mongooseApp__: {
    conn: mongoose.Mongoose | mongoose.Connection | null;
    promise: Promise<mongoose.Mongoose | mongoose.Connection> | null;
  } | undefined;

  // Cached admin Mongoose connection
  var __mongooseAdmin__: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  } | undefined;

  // Cached native MongoClient
  var __mongoClient__: {
    client: MongoClient | null;
    promise: Promise<MongoClient> | null;
  } | undefined;
}

export {};
