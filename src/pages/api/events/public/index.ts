import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../../lib/mongodb';
import { jsonResponse } from '../../../../lib/events/builderAuth';
import EventRecord from '../../../../models/talent/EventRecord';
import { serializeEventRecord, isRegistrationOpen } from '../../../../lib/talent/eventRegistration';

export const GET: APIRoute = async ({ url }) => {
  try {
    await connectAdminDB();

    const status = url.searchParams.get('status') || 'open';
    const query: Record<string, unknown> = {};
    if (status !== 'all') query.registrationStatus = status;

    const events = await EventRecord.find(query).sort({ date: 1 }).lean();
    const now = new Date();

    const serialized = events
      .map((event) => serializeEventRecord(event as Record<string, unknown>, false))
      .filter((event) => {
        if (status !== 'open') return true;
        return isRegistrationOpen(
          {
            registrationStatus: event.registrationStatus as 'draft' | 'open' | 'closed',
            registrationOpensAt: event.registrationOpensAt,
            registrationClosesAt: event.registrationClosesAt,
          },
          now
        );
      });

    return jsonResponse(200, { success: true, events: serialized });
  } catch (error) {
    console.error('[events/public] GET failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};
