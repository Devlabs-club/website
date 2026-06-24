import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { CheckCircle2, Loader2, MessageCircle, ShieldCheck } from "lucide-react";

type ClaimView = {
  builderEmail: string;
  builderName: string;
  headline?: string | null;
  status: string;
  phone?: string | null;
};

type Step = "loading" | "phone" | "code" | "messages" | "error";

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";

export const BuilderClaimPhonePage: React.FC<{ token: string }> = ({ token }) => {
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/builder/claim/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Claim link is invalid.");
        setClaim(data.claim);
        if (data.claim.status === "completed") setStep("messages");
        else setStep(data.claim.phone ? "code" : "phone");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Claim link is invalid.");
        setStep("error");
      }
    })();
  }, [token]);

  const requestCode = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    setDebugCode(null);
    try {
      const res = await fetch(`/api/builder/claim/${encodeURIComponent(token)}/phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not send verification code.");
      setClaim(data.claim);
      setDebugCode(data.debugCode || null);
      setNotice(
        data.delivery?.status === "not_configured"
          ? "Phone message delivery is not configured yet. The claim is linked, but the verification code could not be delivered."
          : "We sent a verification code to your phone."
      );
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/builder/claim/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not verify the code.");
      setClaim(data.claim);
      setNotice(
        data.delivery?.status === "not_configured"
          ? "Phone verified. Message delivery is not configured yet, so DevLabs could not start the Messages interview automatically."
          : "Phone verified. DevLabs sent you a message to continue the claim."
      );
      setStep("messages");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl items-center px-4 py-10">
        <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fa7d22]/10 text-[#fa7d22]">
            {step === "messages" ? <MessageCircle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>

          {step === "loading" ? (
            <div className="flex h-44 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : step === "error" ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Claim link unavailable</h1>
              <p className="mt-3 text-sm text-destructive">{error}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[#fa7d22]">DevLabs builder claim</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                {claim?.builderName ? `Claim ${claim.builderName}` : "Claim your builder profile"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This private link is tied to {claim?.builderEmail}. Verify your phone number, then continue the profile claim in Messages.
              </p>
              {claim?.headline && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{claim.headline}</p>}

              {step === "phone" && (
                <div className="mt-6 space-y-3">
                  <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Phone number for iMessage/SMS verification</span>
                    <input
                      className={inputClass}
                      placeholder="+1 480 555 0199"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void requestCode()}
                    disabled={busy || !phone.trim()}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send verification code
                  </button>
                </div>
              )}

              {step === "code" && (
                <div className="mt-6 space-y-3">
                  <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Verification code</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void verifyCode()}
                    disabled={busy || code.trim().length < 4}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Verify and continue in Messages
                  </button>
                </div>
              )}

              {step === "messages" && (
                <div className="mt-6 rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div>
                      <h2 className="text-sm font-semibold">Continue on your phone</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        The remaining identity checks and profile verification happen in Messages with the DevLabs agent.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {notice && <p className="mt-4 text-sm text-muted-foreground">{notice}</p>}
              {debugCode && <p className="mt-2 text-xs text-muted-foreground">Local debug code: {debugCode}</p>}
              {error && step !== "error" && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default BuilderClaimPhonePage;
