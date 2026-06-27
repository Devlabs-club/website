import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '../../../../lib/mongodb';
import { resolveAuthedBuilder, jsonResponse } from '../../../../lib/events/builderAuth';
import EventRegistration from '../../../../models/talent/EventRegistration';
import EventRecord from '../../../../models/talent/EventRecord';
import {
  isRegistrationOpen,
  validateRegistrationResponses,
  serializeEventRecord,
} from '../../../../lib/talent/eventRegistration';
import type { FormResponseValue } from '../../../../lib/talent/eventTypes';

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await resolveAuthedBuilder(request);
    if ('error' in auth && auth.error) {
      return jsonResponse(auth.status, { success: false, message: auth.error });
    }

    await connectAdminDB();
    const body = await request.json();
    const { eventId, responses } = body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return jsonResponse(400, { success: false, message: 'Valid eventId is required' });
    }
    if (!responses || typeof responses !== 'object') {
      return jsonResponse(400, { success: false, message: 'Responses are required' });
    }

    const event = await EventRecord.findById(eventId);
    if (!event) return jsonResponse(404, { success: false, message: 'Event not found' });

    if (
      !isRegistrationOpen({
        registrationStatus: event.registrationStatus,
        registrationOpensAt: event.registrationOpensAt,
        registrationClosesAt: event.registrationClosesAt,
      })
    ) {
      return jsonResponse(403, { success: false, message: 'Registration is not open for this event' });
    }

    const existing = await EventRegistration.findOne({
      eventId: event._id,
      builderId: auth.builder._id,
    });
    if (existing) {
      return jsonResponse(409, { success: false, message: 'You are already registered for this event' });
    }

    const validation = validateRegistrationResponses(
      event.formSchema as { fields: import('../../../lib/talent/eventTypes').EventFormField[] },
      responses as Record<string, FormResponseValue>
    );
    if (!validation.valid) {
      return jsonResponse(400, {
        success: false,
        message: 'Please fix the form errors',
        errors: validation.errors,
      });
    }

    const registration = await EventRegistration.create({
      eventId: event._id,
      builderId: auth.builder._id,
      userId: auth.userId,
      responses: validation.sanitized,
      status: 'submitted',
      submittedAt: new Date(),
    });

    return jsonResponse(201, {
      success: true,
      registration: {
        _id: String(registration._id),
        eventId: String(registration.eventId),
        event: serializeEventRecord(event.toObject() as Record<string, unknown>, false),
        responses: registration.responses,
        status: registration.status,
        submittedAt: registration.submittedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000) {
      return jsonResponse(409, { success: false, message: 'You are already registered for this event' });
    }
    console.error('[events/registrations] POST failed', error);
    return jsonResponse(500, { success: false, message: 'Internal server error' });
  }
};
