import type { APIRoute } from "astro";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";

export const GET: APIRoute = async () => {
  await connectDB();
  const db = mongoose.connection.db;
  const clients = await db.collection("clients").find().sort({ createdAt: -1 }).toArray();
  return new Response(JSON.stringify({ clients }), { status: 200 });
};
