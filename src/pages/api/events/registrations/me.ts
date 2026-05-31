import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../../lib/mongodb';
import { resolveAuthedBuilder, jsonResponse } from '../../../../lib/events/builderAuth';
import EventRegistration from '../../../../models/talent/EventRegistration';
import EventRecord from '../../../../models/talent/EventRecord';
import { serializeEventRecord } from '../../../../lib/talent/eventRegistration';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await resolveAuthedBuilder(request);
    if ('error' in auth && auth.error) {
      return jsonResponse(auth.status, { success: false, message: auth.error });
    }

    await connectAdminDB();
    const registrations = await EventRegistration.find({ builderId: auth.builder._id })
      .sort({ submittedAt: -1 })
      .lean();

    const eventIds = registrations.map((reg) => reg.eventId);
    const events = await EventRecord.find({ _id: { $in: eventIds } }).lean();
    const eventMap = new Map(
      events.map((event) => [String(event._id), serializeEventRecord(event as Record<string, unknown>, false)])
    );

    return jsonResponse(200, {
      success: true,
      registrations: registrations.map((reg) => ({
        _id: String(reg._id),
        eventId: String(reg.eventId),
        event: eventMap.get(String(reg.eventId)) || null,
        responses: reg.responses || {},
        status: reg.status,
        submittedAt: reg.submittedAt ? new Date(reg.submittedAt).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('[events/registrations/me] GET failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};
