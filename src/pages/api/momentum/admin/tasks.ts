import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectMomentumDB } from '../../../../lib/mongodb';
import { getAuthenticatedUser } from '../../../../lib/momentumRequestAuth';
import { getMomentumTaskSubmissionModel } from '../../../../models/momentumTaskSubmission';
import { getMomentumApplicationModel } from '../../../../models/momentumApplication';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user || auth.user.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const conn = await connectMomentumDB();
    const MomentumTaskSubmission = getMomentumTaskSubmissionModel(conn);
    const MomentumApplication = getMomentumApplicationModel(conn);
    
    const submissions = await MomentumTaskSubmission.find().sort({ createdAt: -1 }).lean();
    
    // Fetch application details to get founder names
    const appIds = [...new Set(submissions.map(s => s.applicationId))];
    const applications = await MomentumApplication.find({ _id: { $in: appIds } }).select('firstName lastName startupName').lean();
    
    const appMap = new Map(applications.map(app => [String(app._id), app]));

    const enrichedSubmissions = submissions.map(sub => ({
      ...sub,
      _id: String(sub._id),
      application: appMap.get(sub.applicationId) || null
    }));

    return new Response(JSON.stringify({ success: true, submissions: enrichedSubmissions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Momentum admin tasks GET error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user || auth.user.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { submissionId, status } = body;

    if (!submissionId || !['pending', 'approved', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid submissionId or status' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid submission id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const conn = await connectMomentumDB();
    const MomentumTaskSubmission = getMomentumTaskSubmissionModel(conn);
    
    const updated = await MomentumTaskSubmission.findByIdAndUpdate(
      submissionId,
      { $set: { status } },
      { new: true }
    ).lean();

    if (!updated) {
      return new Response(
        JSON.stringify({ success: false, message: 'Submission not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        submission: { ...updated, _id: String(updated._id) },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Momentum admin tasks PATCH error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};