import { describe, expect, test } from 'bun:test';
import {
  createEmailVerificationToken,
  hashVerificationToken,
  isAccountEmailVerified,
  isResendCoolingDown,
  signupEmailRejection,
  verificationPageUrl,
} from './emailVerification';

describe('signupEmailRejection', () => {
  test('accepts a real-looking inbox', () => {
    expect(signupEmailRejection('kavya@devlabs.club')).toBeNull();
    expect(signupEmailRejection('founder@gmail.com')).toBeNull();
  });

  test('rejects reserved example domains used in fake signups', () => {
    expect(signupEmailRejection('skip-linkedin-test-917@example.com')).toBe(
      'Please use a real email address you can access'
    );
    expect(signupEmailRejection('user@example.org')).toBe(
      'Please use a real email address you can access'
    );
  });

  test('rejects disposable inboxes', () => {
    expect(signupEmailRejection('abc@mailinator.com')).toBe(
      'Disposable email addresses are not allowed'
    );
  });

  test('rejects malformed addresses', () => {
    expect(signupEmailRejection('not-an-email')).toBe('Please provide a valid email address');
  });
});

describe('isAccountEmailVerified', () => {
  test('requires password accounts to verify', () => {
    expect(isAccountEmailVerified({})).toBe(false);
    expect(isAccountEmailVerified({ emailVerified: false, role: 'founder' })).toBe(false);
  });

  test('treats verified, Google, and admin accounts as verified', () => {
    expect(isAccountEmailVerified({ emailVerified: true })).toBe(true);
    expect(isAccountEmailVerified({ oauthProvider: 'google' })).toBe(true);
    expect(isAccountEmailVerified({ role: 'admin' })).toBe(true);
  });
});

describe('verification tokens', () => {
  test('hashes are stable and one-way', () => {
    const { raw, hash } = createEmailVerificationToken();
    expect(hash).toBe(hashVerificationToken(raw));
    expect(hash).not.toBe(raw);
    expect(raw.length).toBeGreaterThan(20);
  });

  test('builds a verify-email page URL', () => {
    expect(verificationPageUrl('http://localhost:4321', 'abc123', '/founder/home')).toBe(
      'http://localhost:4321/auth/verify-email?token=abc123&redirect=%2Ffounder%2Fhome'
    );
  });
});

describe('isResendCoolingDown', () => {
  test('enforces a short cooldown after a send', () => {
    const now = Date.parse('2026-09-17T12:00:00.000Z');
    expect(isResendCoolingDown(new Date(now - 10_000), now)).toBe(true);
    expect(isResendCoolingDown(new Date(now - 90_000), now)).toBe(false);
    expect(isResendCoolingDown(null, now)).toBe(false);
  });
});
