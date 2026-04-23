import type { APIRoute } from 'astro';
import { connectMomentumDB } from '../../../../lib/mongodb';
import { getAuthenticatedUser } from '../../../../lib/momentumRequestAuth';
import { getMomentumApplicationModel } from '../../../../models/momentumApplication';
import { getMomentumTaskSubmissionModel, TASK_POINTS } from '../../../../models/momentumTaskSubmission';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user) {
      return new Response(
        JSON.stringify({ success: false, message: auth.error }),
        { status: auth.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const conn = await connectMomentumDB();
    const MomentumTaskSubmission = getMomentumTaskSubmissionModel(conn);
    const submissions = await MomentumTaskSubmission.find({ userId: auth.user.id }).sort({ createdAt: -1 }).lean();

    return new Response(JSON.stringify({ success: true, submissions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Momentum tasks GET error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user) {
      return new Response(
        JSON.stringify({ success: false, message: auth.error }),
        { status: auth.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { taskType, proofLink } = body;

    if (!taskType || !TASK_POINTS[taskType as keyof typeof TASK_POINTS]) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid task type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);
    const application = await MomentumApplication.findOne({ userId: auth.user.id }).lean();

    if (!application || application.status !== 'approved' || !application.group) {
      return new Response(
        JSON.stringify({ success: false, message: 'Not an approved Momentum participant' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const MomentumTaskSubmission = getMomentumTaskSubmissionModel(conn);
    const submission = await MomentumTaskSubmission.create({
      userId: auth.user.id,
      applicationId: String(application._id),
      group: application.group,
      taskType,
      proofLink,
      status: 'pending',
      points: TASK_POINTS[taskType as keyof typeof TASK_POINTS],
    });

    return new Response(JSON.stringify({ success: true, submission }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Momentum tasks POST error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};