import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectMomentumDB } from '../../../../lib/mongodb';
import { getAuthenticatedUser } from '../../../../lib/momentumRequestAuth';
import { getMomentumApplicationModel } from '../../../../models/momentumApplication';
import { sendApplicationApprovedEmail, sendApplicationRejectedEmail } from '../../../../lib/momentumEmail';

function toClientDoc(doc: Record<string, unknown>) {
  return {
    ...doc,
    _id: String(doc._id),
    userId: String(doc.userId ?? ''),
  };
}

function logSendGridErr(err: unknown) {
  const body = err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { body?: unknown } }).response?.body
    : undefined;
  console.error('Momentum status email failed:', body ?? err);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user) {
      return new Response(
        JSON.stringify({ success: false, message: auth.error }),
        { status: auth.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (auth.user.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);
    const raw = await MomentumApplication.find().sort({ createdAt: -1 }).lean();
    const applications = raw.map((d) => toClientDoc(d as Record<string, unknown>));

    return new Response(JSON.stringify({ success: true, applications }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Momentum admin list error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user) {
      return new Response(
        JSON.stringify({ success: false, message: auth.error }),
        { status: auth.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (auth.user.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { applicationId, status } = body;

    if (!applicationId || !['pending', 'approved', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid applicationId or status' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid application id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);
    
    const existing = await MomentumApplication.findById(applicationId).lean();
    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, message: 'Application not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const updated = await MomentumApplication.findByIdAndUpdate(
      applicationId,
      { $set: { status } },
      { new: true }
    ).lean();

    if (!updated) {
      return new Response(
        JSON.stringify({ success: false, message: 'Application not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Trigger the appropriate email based on the new status, only if it changed
    if (existing.status !== status) {
      if (status === 'approved') {
        sendApplicationApprovedEmail(updated.email, updated.firstName).catch(logSendGridErr);
      } else if (status === 'rejected') {
        sendApplicationRejectedEmail(updated.email, updated.firstName).catch(logSendGridErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        application: toClientDoc(updated as Record<string, unknown>),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Momentum admin patch error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
