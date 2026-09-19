import { describe, expect, test } from 'bun:test';
import { OauthException } from '@workos-inc/node';
import { nameFromWorkOSUser, parseWorkOSAuthError, splitDisplayName } from './workosAuth';

describe('parseWorkOSAuthError', () => {
  test('extracts email verification pending token', () => {
    const error = new OauthException(
      403,
      'req_1',
      'email_verification_required',
      'Email ownership must be verified before authentication.',
      { pending_authentication_token: 'pending_abc', email: 'kavya@devlabs.club' }
    );
    expect(parseWorkOSAuthError(error)).toEqual({
      code: 'email_verification_required',
      pendingAuthenticationToken: 'pending_abc',
      message: 'Email ownership must be verified before authentication.',
    });
  });

  test('maps invalid credentials', () => {
    const error = new OauthException(401, 'req_2', 'invalid_credentials', 'Email or password is incorrect.', {});
    expect(parseWorkOSAuthError(error).code).toBe('invalid_credentials');
  });
});

describe('name helpers', () => {
  test('prefers WorkOS first and last name', () => {
    expect(nameFromWorkOSUser({ firstName: 'Kavya', lastName: 'Rao', email: 'k@devlabs.club' })).toBe('Kavya Rao');
  });

  test('falls back to the email local part', () => {
    expect(nameFromWorkOSUser({ email: 'kavya.rao@devlabs.club' })).toBe('Kavya Rao');
  });

  test('splits a display name for WorkOS createUser', () => {
    expect(splitDisplayName('Kavya Rao', 'k@devlabs.club')).toEqual({
      firstName: 'Kavya',
      lastName: 'Rao',
    });
  });
});
