import { describe, expect, it } from 'bun:test';
import { evaluateSignupEmailSync, SIGNUP_EMAIL_REJECT_MESSAGE } from './signupEmail';
import { evaluateSignupEmail, lookupDomainMail } from './signupEmailDeliverability';

describe('evaluateSignupEmailSync', () => {
  it('accepts normal personal and work emails', () => {
    for (const email of [
      'kavya@devlabs.in',
      'founder@startup.com',
      'ada.lovelace@gmail.com',
      'name@asu.edu',
    ]) {
      const result = evaluateSignupEmailSync(email);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects the fake fmakxm.ck signup that created a founder account', () => {
    const result = evaluateSignupEmailSync('shansbbsbshsnabdjsahahshahah@fmakxm.ck');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('blocked_tld');
      expect(result.message).toBe(SIGNUP_EMAIL_REJECT_MESSAGE);
    }
  });

  it('rejects disposable inbox hosts and subdomains', () => {
    for (const email of ['bot@mailinator.com', 'x@foo.yopmail.com', 'temp@guerrillamail.com']) {
      const result = evaluateSignupEmailSync(email);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('disposable');
    }
  });

  it('rejects other throwaway TLDs', () => {
    const result = evaluateSignupEmailSync('person@something.tk');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('blocked_tld');
  });

  it('still requires a well-formed address', () => {
    expect(evaluateSignupEmailSync('not-an-email').ok).toBe(false);
    expect(evaluateSignupEmailSync('missing-tld@localhost').ok).toBe(false);
  });
});

describe('evaluateSignupEmail', () => {
  it('rejects domains that do not accept mail even when the TLD is allowed', async () => {
    const result = await evaluateSignupEmail('human@this-domain-does-not-exist.example', {
      lookupMail: async () => 'no',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('undeliverable');
  });

  it('allows signups when DNS is unknown so an outage does not lock the door', async () => {
    const result = await evaluateSignupEmail('ada@gmail.com', {
      lookupMail: async () => 'unknown',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts domains that resolve MX', async () => {
    const result = await evaluateSignupEmail('ada@gmail.com', {
      lookupMail: async () => 'yes',
    });
    expect(result.ok).toBe(true);
  });
});

describe('live mail lookup', () => {
  it('rejects the spam domain over DNS and accepts gmail', async () => {
    const spam = await evaluateSignupEmail('shansbbsbshsnabdjsahahshahah@fmakxm.ck');
    expect(spam.ok).toBe(false);

    const gmail = await evaluateSignupEmail('kavya@gmail.com');
    expect(gmail.ok).toBe(true);
  });

  it('treats fmakxm.ck as unable to receive mail', async () => {
    expect(await lookupDomainMail('fmakxm.ck')).toBe('no');
    expect(await lookupDomainMail('gmail.com')).toBe('yes');
  });
});
