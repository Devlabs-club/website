import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '../../../../lib/mongodb';
import { requireAdmin, jsonResponse } from '../../../../lib/events/adminAuth';
import EventRegistration from '../../../../models/talent/EventRegistration';
import BuilderProfile from '../../../../models/talent/BuilderProfile';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const eventId = url.searchParams.get('eventId');
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return jsonResponse(400, { success: false, message: 'Valid eventId is required' });
    }

    await connectAdminDB();

    const registrations = await EventRegistration.find({ eventId })
      .sort({ submittedAt: -1 })
      .lean();

    const builderIds = registrations.map((reg) => reg.builderId);
    const builders = await BuilderProfile.find({ _id: { $in: builderIds } })
      .select('name email headline')
      .lean();
    const builderMap = new Map(builders.map((b) => [String(b._id), b]));

    const rows = registrations.map((reg) => {
      const builder = builderMap.get(String(reg.builderId));
      return {
        _id: String(reg._id),
        eventId: String(reg.eventId),
        builderId: String(reg.builderId),
        userId: String(reg.userId),
        builderName: builder?.name || 'Unknown',
        builderEmail: builder?.email || '',
        builderHeadline: builder?.headline || null,
        responses: reg.responses || {},
        status: reg.status,
        submittedAt: reg.submittedAt ? new Date(reg.submittedAt).toISOString() : null,
        createdAt: reg.createdAt ? new Date(reg.createdAt).toISOString() : null,
      };
    });

    return jsonResponse(200, { success: true, registrations: rows });
  } catch (error) {
    console.error('[events/admin/registrations] GET failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};
