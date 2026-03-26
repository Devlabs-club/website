import type { APIRoute } from 'astro';
import { connectMomentumDB } from '../../../lib/mongodb';
import { getAuthenticatedUser } from '../../../lib/momentumRequestAuth';
import { getMomentumApplicationModel } from '../../../models/momentumApplication';

function toClientDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  return {
    ...doc,
    _id: String(doc._id),
    userId: String(doc.userId ?? ''),
  };
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

    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);
    const application = await MomentumApplication.findOne({
      userId: String(auth.user._id),
    }).lean();

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: String(auth.user._id),
          name: auth.user.name,
          email: auth.user.email,
          role: auth.user.role,
        },
        application: toClientDoc(application as Record<string, unknown> | null),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Momentum portal error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
