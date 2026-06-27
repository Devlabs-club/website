import jwt from 'jsonwebtoken';
import type { IUser } from '../models/user.tsx';
import type { AuthUser } from './adminMongo';
import { ensureLocalEnvLoaded } from './loadEnv';
import { readEnv, type RuntimeEnv } from './workosEnv';

ensureLocalEnvLoaded();

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

function getJwtSecret(runtime?: RuntimeEnv): string {
  const secret = readEnv('JWT_SECRET', runtime);
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not defined. Add it to .env, .env.local, or .dev.vars (see .dev.vars.example).'
    );
  }
  return secret;
}

type TokenUser = Pick<IUser, '_id' | 'email' | 'role'> | AuthUser;

// Generate JWT token
export function generateToken(user: TokenUser, runtime?: RuntimeEnv): string {
  const payload: JWTPayload = {
    userId: String(user._id),
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, getJwtSecret(runtime), {
    expiresIn: '7d',
  });
}

// Verify JWT token
export function verifyToken(token: string, runtime?: RuntimeEnv): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(runtime)) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// Extract token from Authorization header
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  
  return null;
}

// Extract token from cookies
export function extractTokenFromCookies(cookies: string): string | null {
  const cookieArray = cookies.split(';');
  
  for (const cookie of cookieArray) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'auth-token') {
      return value;
    }
  }
  
  return null;
}

// Validate email format (aligned with User schema — supports modern TLDs)
export function isValidEmail(email: string): boolean {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
  return emailRegex.test(email.trim());
}

// Validate password strength
export function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  return { valid: true };
}
