import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '../../../../lib/mongodb';
import { requireAdmin, jsonResponse } from '../../../../lib/events/adminAuth';
import EventRecord from '../../../../models/talent/EventRecord';
import { serializeEventRecord } from '../../../../lib/talent/eventRegistration';
import { EVENT_TYPES, REGISTRATION_STATUSES, slugifyEventName, isValidHttpUrl } from '../../../../lib/talent/eventTypes';

function normalizeFormSchema(formSchema: unknown) {
  if (!formSchema || typeof formSchema !== 'object') return { fields: [] };
  const fields = Array.isArray((formSchema as { fields?: unknown[] }).fields)
    ? (formSchema as { fields: unknown[] }).fields
    : [];
  return { fields };
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string) {
  let slug = baseSlug || 'event';
  let suffix = 0;
  while (true) {
    const query: Record<string, unknown> = { slug };
    if (excludeId) query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    const existing = await EventRecord.findOne(query).lean();
    if (!existing) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    await connectAdminDB();
    const events = await EventRecord.find().sort({ date: -1 }).lean();
    return jsonResponse(200, {
      success: true,
      events: events.map((event) => serializeEventRecord(event as Record<string, unknown>, true)),
    });
  } catch (error) {
    console.error('[events/admin/events] GET failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    await connectAdminDB();
    const body = await request.json();
    const {
      name,
      slug,
      date,
      endDate,
      type,
      location,
      description,
      websiteUrl,
      headerImageUrl,
      registrationStatus,
      registrationOpensAt,
      registrationClosesAt,
      formSchema,
    } = body;

    if (!name?.trim()) return jsonResponse(400, { success: false, message: 'Name is required' });
    if (!date) return jsonResponse(400, { success: false, message: 'Date is required' });
    if (!type || !EVENT_TYPES.includes(type)) {
      return jsonResponse(400, { success: false, message: 'Valid event type is required' });
    }
    if (!websiteUrl?.trim() || !isValidHttpUrl(websiteUrl.trim())) {
      return jsonResponse(400, { success: false, message: 'Valid website URL is required' });
    }

    const baseSlug = slugifyEventName(slug?.trim() || name);
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const event = await EventRecord.create({
      name: name.trim(),
      slug: uniqueSlug,
      date: new Date(date),
      endDate: endDate ? new Date(endDate) : null,
      type,
      location: location?.trim() || null,
      description: description?.trim() || null,
      websiteUrl: websiteUrl.trim(),
      headerImageUrl: headerImageUrl || null,
      registrationStatus: REGISTRATION_STATUSES.includes(registrationStatus)
        ? registrationStatus
        : 'draft',
      registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null,
      registrationClosesAt: registrationClosesAt ? new Date(registrationClosesAt) : null,
      formSchema: normalizeFormSchema(formSchema),
      source: 'manual',
      verificationStatus: 'admin_verified',
      createdBy: admin.user._id,
    });

    return jsonResponse(201, {
      success: true,
      event: serializeEventRecord(event.toObject() as Record<string, unknown>, true),
    });
  } catch (error) {
    console.error('[events/admin/events] POST failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    await connectAdminDB();
    const body = await request.json();
    const { eventId, ...updates } = body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return jsonResponse(400, { success: false, message: 'Valid eventId is required' });
    }

    const event = await EventRecord.findById(eventId);
    if (!event) return jsonResponse(404, { success: false, message: 'Event not found' });

    if (updates.name !== undefined) event.name = String(updates.name).trim();
    if (updates.date !== undefined) event.date = new Date(updates.date);
    if (updates.endDate !== undefined) event.endDate = updates.endDate ? new Date(updates.endDate) : null;
    if (updates.type !== undefined) {
      if (!EVENT_TYPES.includes(updates.type)) {
        return jsonResponse(400, { success: false, message: 'Invalid event type' });
      }
      event.type = updates.type;
    }
    if (updates.location !== undefined) event.location = updates.location?.trim() || null;
    if (updates.description !== undefined) event.description = updates.description?.trim() || null;
    if (updates.websiteUrl !== undefined) {
      const url = String(updates.websiteUrl).trim();
      if (!isValidHttpUrl(url)) {
        return jsonResponse(400, { success: false, message: 'Valid website URL is required' });
      }
      event.websiteUrl = url;
    }
    if (updates.headerImageUrl !== undefined) event.headerImageUrl = updates.headerImageUrl || null;
    if (updates.registrationStatus !== undefined) {
      if (!REGISTRATION_STATUSES.includes(updates.registrationStatus)) {
        return jsonResponse(400, { success: false, message: 'Invalid registration status' });
      }
      event.registrationStatus = updates.registrationStatus;
    }
    if (updates.registrationOpensAt !== undefined) {
      event.registrationOpensAt = updates.registrationOpensAt ? new Date(updates.registrationOpensAt) : null;
    }
    if (updates.registrationClosesAt !== undefined) {
      event.registrationClosesAt = updates.registrationClosesAt ? new Date(updates.registrationClosesAt) : null;
    }
    if (updates.formSchema !== undefined) {
      event.formSchema = normalizeFormSchema(updates.formSchema);
    }
    if (updates.slug !== undefined) {
      const baseSlug = slugifyEventName(String(updates.slug).trim() || event.name);
      event.slug = await ensureUniqueSlug(baseSlug, event._id.toString());
    }

    await event.save();

    return jsonResponse(200, {
      success: true,
      event: serializeEventRecord(event.toObject() as Record<string, unknown>, true),
    });
  } catch (error) {
    console.error('[events/admin/events] PATCH failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};
