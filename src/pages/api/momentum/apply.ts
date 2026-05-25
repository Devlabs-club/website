import type { APIRoute } from 'astro';
import { connectMomentumDB } from '../../../lib/mongodb';
import { getAuthenticatedUser } from '../../../lib/momentumRequestAuth';
import {
  getMomentumApplicationModel,
  wordCount,
} from '../../../models/momentumApplication';
import { sendApplicationReceivedEmail } from '../../../lib/momentumEmail';

const REQUIRED_STRING = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'city',
  'state',
  'country',
  'startupName',
  'startupAge',
  'founderType',
  'startupDomain',
  'description',
  'accomplishments',
  'adjectives',
  'demoVideo',
  'heardAboutUs',
] as const;

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
    const userId = String(auth.user._id);

    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);

    const existing = await MomentumApplication.findOne({ userId });
    if (existing) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'You have already submitted an application.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    for (const key of REQUIRED_STRING) {
      const v = body[key];
      if (v === undefined || v === null || String(v).trim() === '') {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Missing required field: ${key}`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (typeof body.hasCoFounder !== 'boolean') {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'hasCoFounder must be true or false',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    for (const key of ['hasRevenue', 'isIncorporated', 'hasRaisedMoney', 'lookingToFundraise']) {
      if (typeof body[key] !== 'boolean') {
        return new Response(
          JSON.stringify({
            success: false,
            message: `${key} must be true or false`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const numCoFounders = Math.max(0, Math.floor(Number(body.numCoFounders) || 0));
    const description = String(body.description).trim();
    if (wordCount(description) > 50) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Please keep your description to 50 words or fewer.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const doc = await MomentumApplication.create({
      userId,
      status: 'pending',
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      email: String(body.email).trim().toLowerCase(),
      phone: String(body.phone).trim(),
      city: String(body.city).trim(),
      state: String(body.state).trim(),
      country: String(body.country).trim(),
      startupName: String(body.startupName).trim(),
      startupAge: String(body.startupAge).trim(),
      founderType: String(body.founderType).trim(),
      startupDomain: String(body.startupDomain).trim(),
      hasCoFounder: body.hasCoFounder,
      numCoFounders,
      coFounderDetails: String(body.coFounderDetails ?? '').trim(),
      description,
      accomplishments: String(body.accomplishments).trim(),
      adjectives: String(body.adjectives).trim(),
      websiteOrGithub: String(body.websiteOrGithub ?? '').trim(),
      demoVideo: String(body.demoVideo).trim(),
      linkedin: String(body.linkedin ?? '').trim(),
      twitter: String(body.twitter ?? '').trim(),
      pitchDeck: String(body.pitchDeck ?? '').trim(),
      keyMetrics: String(body.keyMetrics ?? '').trim(),
      hasRevenue: body.hasRevenue,
      isIncorporated: body.isIncorporated,
      hasRaisedMoney: body.hasRaisedMoney,
      lookingToFundraise: body.lookingToFundraise,
      heardAboutUs: String(body.heardAboutUs).trim(),
    });

    // Send application received email asynchronously
    sendApplicationReceivedEmail(doc.email, doc.firstName).catch((err) => {
      console.error('Failed to send received email:', err);
    });

    const lean = doc.toObject();
    return new Response(JSON.stringify({ success: true, application: lean }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Momentum apply error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
