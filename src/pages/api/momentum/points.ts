import type { APIRoute } from 'astro';
import { connectMomentumDB } from '../../../lib/mongodb';
import { getAuthenticatedUser } from '../../../lib/momentumRequestAuth';
import { getMomentumTaskSubmissionModel } from '../../../models/momentumTaskSubmission.ts';

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
    
    // Aggregate points by group, only for approved tasks
    const pointsData = await MomentumTaskSubmission.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$group', totalPoints: { $sum: '$points' } } }
    ]);

    const groups = ['Velocity', 'Inertia', 'Flux', 'Gravity'];
    const pointsTable = groups.map(group => {
      const found = pointsData.find(p => p._id === group);
      return {
        group,
        points: found ? found.totalPoints : 0
      };
    }).sort((a, b) => b.points - a.points);

    return new Response(JSON.stringify({ success: true, pointsTable }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Momentum points GET error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};