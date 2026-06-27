import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

type TwilioVerifyConfig = {
  username: string;
  password: string;
  serviceSid: string;
};

export type TwilioVerifyStartResult = {
  sid: string | null;
  status: string | null;
};

export type TwilioVerifyCheckResult = {
  sid: string | null;
  status: string | null;
  approved: boolean;
};

export function getTwilioVerifyConfig(runtime?: RuntimeEnv): TwilioVerifyConfig | null {
  const accountSid = readEnv('TWILIO_ACCOUNT_SID', runtime);
  const authToken = readEnv('TWILIO_AUTH_TOKEN', runtime);
  const apiKeySid = readEnv('TWILIO_API_KEY_SID', runtime);
  const apiKeySecret = readEnv('TWILIO_API_KEY_SECRET', runtime);
  const serviceSid = readEnv('TWILIO_VERIFY_SERVICE_SID', runtime);
  if (!serviceSid) return null;
  if (apiKeySid && apiKeySecret) return { username: apiKeySid, password: apiKeySecret, serviceSid };
  if (accountSid && authToken) return { username: accountSid, password: authToken, serviceSid };
  return null;
}

function authHeader(config: TwilioVerifyConfig) {
  const encoded =
    typeof Buffer !== 'undefined'
      ? Buffer.from(`${config.username}:${config.password}`).toString('base64')
      : btoa(`${config.username}:${config.password}`);
  return `Basic ${encoded}`;
}

async function parseTwilioResponse(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.message || data?.detail || response.statusText;
    throw new Error(`Twilio Verify failed (${response.status}): ${message}`);
  }
  return data;
}

export async function startSmsVerification(phone: string, runtime?: RuntimeEnv): Promise<TwilioVerifyStartResult> {
  const config = getTwilioVerifyConfig(runtime);
  if (!config) throw new Error('Twilio Verify is not configured.');

  const body = new URLSearchParams({
    To: phone,
    Channel: 'sms',
  });

  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}/Verifications`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await parseTwilioResponse(response);
  return { sid: data.sid || null, status: data.status || null };
}

export async function checkSmsVerification(phone: string, code: string, runtime?: RuntimeEnv): Promise<TwilioVerifyCheckResult> {
  const config = getTwilioVerifyConfig(runtime);
  if (!config) throw new Error('Twilio Verify is not configured.');

  const body = new URLSearchParams({
    To: phone,
    Code: code,
  });

  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}/VerificationCheck`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await parseTwilioResponse(response);
  return {
    sid: data.sid || null,
    status: data.status || null,
    approved: data.status === 'approved',
  };
}
