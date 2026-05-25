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
    const { taskType, proofLink, proofLinkSecondary } = body as {
      taskType?: string;
      proofLink?: string;
      proofLinkSecondary?: string;
    };

    if (!taskType || !TASK_POINTS[taskType as keyof typeof TASK_POINTS]) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid task type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const primary = typeof proofLink === 'string' ? proofLink.trim() : '';
    const secondary =
      typeof proofLinkSecondary === 'string'
        ? proofLinkSecondary.trim()
        : '';

    if (taskType === 'checkpoint_5_submission') {
      if (!primary || !secondary) {
        return new Response(
          JSON.stringify({
            success: false,
            message:
              'Checkpoint 5 requires both your public post URL (with the pitch video) and your pitch deck link.',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } else if (!primary) {
      return new Response(
        JSON.stringify({ success: false, message: 'Proof link is required' }),
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
    const submissionPayload: Record<string, unknown> = {
      userId: auth.user.id,
      applicationId: String(application._id),
      group: application.group,
      taskType,
      proofLink: primary || undefined,
      status: 'pending',
      points: TASK_POINTS[taskType as keyof typeof TASK_POINTS],
    };
    if (secondary) submissionPayload.proofLinkSecondary = secondary;
    const submission = await MomentumTaskSubmission.create(submissionPayload);

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