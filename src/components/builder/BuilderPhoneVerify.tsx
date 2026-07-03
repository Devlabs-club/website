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
    <div className="mx-auto w-full max-w-md rounded-[22px] border border-[#1a140f]/10 bg-[#fbfaf7] p-6 shadow-[0_16px_42px_rgba(33,24,16,0.07)] sm:p-8">
      {step === 'phone' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#fa7d22]">Builder verification</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#14110f]">Verify your phone</h2>
          <p className="mt-2 text-sm leading-6 text-[#746b62]">
            We'll text you a code so the DevLabs agent can reach you about your profile. Everything
            else happens in Messages.
          </p>
          <label className="mt-5 block text-sm font-bold text-[#14110f]" htmlFor="bv-phone">
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
            className="mt-1.5 w-full rounded-xl border border-[#1a140f]/10 bg-white px-3.5 py-3 text-sm font-medium text-[#14110f] outline-none placeholder:text-[#aaa198] focus:border-[color:var(--bv-orange)]"
            style={{ ['--bv-orange' as string]: ORANGE }}
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            className="dashboard-orange-button mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50"
            style={{ background: ORANGE }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send code
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#fa7d22]">One-time code</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#14110f]">Enter the code</h2>
          <p className="mt-2 text-sm leading-6 text-[#746b62]">
            We texted a 6-digit code to <span className="font-bold text-[#14110f]">{phone}</span>.
          </p>
          <label className="mt-5 block text-sm font-bold text-[#14110f]" htmlFor="bv-code">
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
            className="mt-1.5 w-full rounded-xl border border-[#1a140f]/10 bg-white px-3.5 py-3 text-sm font-bold tracking-[0.3em] text-[#14110f] outline-none placeholder:text-[#aaa198] focus:border-[color:var(--bv-orange)]"
            style={{ ['--bv-orange' as string]: ORANGE }}
          />
          <button
            type="button"
            onClick={confirmCode}
            disabled={busy}
            className="dashboard-orange-button mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50"
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
            className="mt-3 w-full text-center text-xs font-semibold text-[#746b62] hover:text-[#14110f]"
          >
            Use a different number
          </button>
        </>
      )}

      {step === 'done' && (
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#fa7d22]">Ready</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#14110f]">You're verified</h2>
          <p className="mt-2 text-sm leading-6 text-[#746b62]">
            DevLabs just texted you in Messages. Open it and say hi.
          </p>
          <a
            href={`sms:${phone}`}
            className="dashboard-orange-button mt-5 block rounded-xl px-4 py-3 text-sm font-bold transition-colors"
            style={{ background: ORANGE }}
          >
            Open Messages
          </a>
          <button
            type="button"
            onClick={onVerified}
            className="mt-3 w-full text-center text-sm font-semibold text-[#746b62] hover:text-[#14110f]"
          >
            View my profile
          </button>
        </div>
      )}

      {error ? <p className="mt-3 text-center text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  );
};

export default BuilderPhoneVerify;
