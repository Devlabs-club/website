import { connectAdminDB } from './mongodb';
import User from '../models/user';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from './auth';

export async function getAuthenticatedUser(request: Request) {
  await connectAdminDB();

  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie');

  let token = extractTokenFromHeader(authHeader);
  if (!token && cookieHeader) {
    token = extractTokenFromCookies(cookieHeader);
  }

  if (!token) {
    return {
      user: null as Awaited<ReturnType<typeof User.findById>> | null,
      error: 'No authentication token provided',
      status: 401 as const,
    };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return {
      user: null,
      error: 'Invalid or expired token',
      status: 401 as const,
    };
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    return { user: null, error: 'User not found', status: 404 as const };
  }

  return { user, error: null, status: 200 as const };
}
