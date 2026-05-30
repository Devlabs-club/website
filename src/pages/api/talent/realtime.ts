import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, verifyToken } from '@/lib/auth';

export const GET: APIRoute = async ({ request, url }) => {
  const cookieHeader = request.headers.get('cookie') || '';
  const token = extractTokenFromCookies(cookieHeader);
  const payload = token ? verifyToken(token) : null;
  if (!payload?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const scope = url.searchParams.get('scope') || 'founder';
  const opportunityId = url.searchParams.get('opportunityId');

  await connectAdminDB();

  const encoder = new TextEncoder();
  let changeStream: mongoose.mongo.ChangeStream | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: change\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const ping = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
      };

      heartbeat = setInterval(ping, 15000);
      ping();

      try {
        const db = mongoose.connection.db;
        if (!db) throw new Error('No database connection');

        const pipeline: Record<string, unknown>[] = [];
        if (opportunityId && mongoose.Types.ObjectId.isValid(opportunityId)) {
          pipeline.push({
            $match: {
              'fullDocument.opportunityId': new mongoose.Types.ObjectId(opportunityId),
            },
          });
        }

        const collections = ['matchrecords', 'introrequests', 'callschedules', 'notifications'];
        const streams = collections.map((name) =>
          db.collection(name).watch(pipeline, { fullDocument: 'updateLookup' })
        );

        for (const cs of streams) {
          cs.on('change', (change) => {
            send({
              type: 'change',
              collection: change.ns?.coll,
              operationType: change.operationType,
              documentId: change.documentKey?._id ? String(change.documentKey._id) : null,
              at: new Date().toISOString(),
            });
          });
        }

        changeStream = streams[0];
      } catch (error) {
        console.warn('[realtime] change stream unavailable, heartbeat only:', error);
      }

      request.signal.addEventListener('abort', () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        changeStream?.close().catch(() => undefined);
        controller.close();
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      changeStream?.close().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
