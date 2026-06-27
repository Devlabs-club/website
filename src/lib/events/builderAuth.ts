import { connectAdminDB } from '../mongodb';
import BuilderProfile from '../../models/talent/BuilderProfile';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../auth';

export async function resolveAuthedBuilder(request: Request) {
  await connectAdminDB();

  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);

  if (!token) {
    return { error: 'Please log in to continue.', status: 401 as const };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { error: 'Session expired. Please log in again.', status: 401 as const };
  }

  const email = (decoded.email || '').toLowerCase().trim();
  if (!email) {
    return { error: 'Authenticated email not available in session.', status: 401 as const };
  }

  let builder = await BuilderProfile.findOne({
    $or: [{ userId: decoded.userId }, { email }],
  });

  if (!builder) {
    const fallbackName = email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    builder = await BuilderProfile.create({
      userId: decoded.userId,
      email,
      name: fallbackName || 'Builder',
      verificationStatus: 'builder_confirmed',
      availability: {
        availableNow: true,
        hoursPerWeek: null,
        remotePreference: 'unspecified',
        salaryExpectationMin: null,
        salaryExpectationMax: null,
        earliestStartDate: null,
      },
      hiringIntent: { optedIn: true, projectSprint: true },
    });
  }

  return {
    builder,
    userId: decoded.userId,
    email,
    status: 200 as const,
  };
}

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
