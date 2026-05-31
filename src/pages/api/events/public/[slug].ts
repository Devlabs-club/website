import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../../lib/mongodb';
import { jsonResponse } from '../../../../lib/events/builderAuth';
import EventRecord from '../../../../models/talent/EventRecord';
import { serializeEventRecord, isRegistrationOpen } from '../../../../lib/talent/eventRegistration';

export const GET: APIRoute = async ({ params }) => {
  try {
    const slug = params.slug;
    if (!slug) return jsonResponse(400, { success: false, message: 'Slug is required' });

    await connectAdminDB();
    const event = await EventRecord.findOne({ slug }).lean();
    if (!event) return jsonResponse(404, { success: false, message: 'Event not found' });

    const serialized = serializeEventRecord(event as Record<string, unknown>, true);
    const open = isRegistrationOpen({
      registrationStatus: serialized.registrationStatus as 'draft' | 'open' | 'closed',
      registrationOpensAt: serialized.registrationOpensAt,
      registrationClosesAt: serialized.registrationClosesAt,
    });

    if (!open) {
      return jsonResponse(403, {
        success: false,
        message: 'Registration is not open for this event',
        event: {
          _id: serialized._id,
          name: serialized.name,
          slug: serialized.slug,
          headerImageUrl: serialized.headerImageUrl,
          websiteUrl: serialized.websiteUrl,
          registrationStatus: serialized.registrationStatus,
        },
      });
    }

    return jsonResponse(200, { success: true, event: serialized });
  } catch (error) {
    console.error('[events/public/slug] GET failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};
