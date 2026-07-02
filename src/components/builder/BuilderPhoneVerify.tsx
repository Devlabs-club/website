import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import AgentTraceSetup from './AgentTraceSetup';

const ORANGE = '#fa7d22';

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/builder/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * Phone verification gate for the builder home. The logged-in builder enters
 * their number, confirms the OTP, and the DevLabs agent texts them first — the
 * whole builder experience then continues in iMessage.
 */
export const BuilderPhoneVerify: React.FC<{
  defaultPhone?: string | null;
  phoneVerificationPending?: boolean;
  onVerified: () => void | Promise<void>;
}> = ({ defaultPhone, phoneVerificationPending = false, onVerified }) => {
  const [step, setStep] = useState<'phone' | 'code' | 'trace' | 'done'>(
    phoneVerificationPending && defaultPhone ? 'code' : 'phone'
  );
  const [phone, setPhone] = useState(defaultPhone || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentWrapped, setAgentWrapped] = useState<{
    builderId: string;
    uploadToken: string;
    command: string;
    publicUrl: string;
    messageDelivery?: MessageDelivery | null;
  } | null>(null);

  const sendCode = async () => {
    setError(null);
    if (!phone.trim()) return setError('Enter your mobile number.');
    setBusy(true);
    const { status, data } = await post({ action: 'start', phone: phone.trim() });
    setBusy(false);
    if (status === 200 && data.ok) {
      setStep('code');
    } else {
      setError(
        data.error === 'invalid_phone'
          ? "That doesn't look like a valid number."
          : 'Could not send the code. Try again.',
      );
    }
  };

  const confirmCode = async () => {
    setError(null);
    if (!code.trim()) return setError('Enter the 6-digit code.');
    setBusy(true);
    const { status, data } = await post({ action: 'confirm', phone: phone.trim(), code: code.trim() });
    setBusy(false);
    if (status === 200 && data.ok) {
      if (data.agentWrapped) {
        setAgentWrapped({ ...data.agentWrapped, messageDelivery: data.messageDelivery || null });
        setStep('trace');
      } else {
        setStep('done');
      }
    } else {
      setError(
        data.error === 'wrong_code'
          ? `Wrong code. ${data.attemptsLeft ?? ''} tries left.`
          : data.error === 'expired'
            ? 'Code expired — go back and resend.'
            : data.error === 'too_many_attempts'
              ? 'Too many tries. Resend a new code.'
              : 'Could not verify. Try again.',
      );
    }
  };

  if (step === 'trace' && agentWrapped) {
    return (
      <AgentTraceSetup
        builderId={agentWrapped.builderId}
        uploadToken={agentWrapped.uploadToken}
        command={agentWrapped.command}
        publicUrl={agentWrapped.publicUrl}
        messageDelivery={agentWrapped.messageDelivery}
        onComplete={onVerified}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8">
      {step === 'phone' && (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Verify your phone</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We'll text you a code so the DevLabs agent can reach you about your profile. Everything
            else happens in Messages.
          </p>
          <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="bv-phone">
            Mobile number
          </label>
          <input
            id="bv-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--bv-orange)]"
            style={{ ['--bv-orange' as string]: ORANGE }}
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
            style={{ background: ORANGE }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send code
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Enter the code</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We texted a 6-digit code to <span className="font-medium text-foreground">{phone}</span>.
          </p>
          <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="bv-code">
            Verification code
          </label>
          <input
            id="bv-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm tracking-[0.3em] outline-none focus:border-[color:var(--bv-orange)]"
            style={{ ['--bv-orange' as string]: ORANGE }}
          />
          <button
            type="button"
            onClick={confirmCode}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
            style={{ background: ORANGE }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verify
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Use a different number
          </button>
        </>
      )}

      {step === 'done' && (
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight">You're verified</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            DevLabs just texted you in Messages. Open it and say hi.
          </p>
          <a
            href={`sms:${phone}`}
            className="mt-5 block rounded-xl px-4 py-3 text-sm font-semibold text-black"
            style={{ background: ORANGE }}
          >
            Open Messages
          </a>
          <button
            type="button"
            onClick={onVerified}
            className="mt-3 w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            View my profile
          </button>
        </div>
      )}

      {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export default BuilderPhoneVerify;
