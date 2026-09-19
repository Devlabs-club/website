import React, { useMemo, useState } from "react";
import { AuthShell } from "./AuthShell";
import { resolvePostAuthDestination } from "@/lib/authDestination";
import { Loader2 } from "lucide-react";

type AuthCheckEmailPageProps = {
  email?: string;
  redirect?: string;
  error?: string;
};

const authInputClassName =
  "h-[3.35rem] w-full rounded-none border border-border bg-card px-4 text-center text-lg tracking-[0.35em] text-foreground shadow-[0_14px_24px_rgba(0,0,0,0.04)] outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-sm focus:border-primary focus:shadow-[0_14px_24px_rgba(255,116,23,0.12)]";

export const AuthCheckEmailPage: React.FC<AuthCheckEmailPageProps> = ({
  email: initialEmail,
  redirect,
  error,
}) => {
  const email = useMemo(() => {
    if (initialEmail) return initialEmail;
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("email") || "";
  }, [initialEmail]);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState(error || "");

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setStatus("error");
      setMessage("Enter the 6-digit code from your email.");
      return;
    }
    setStatus("verifying");
    setMessage("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: trimmed, redirect: redirect || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setStatus("error");
        setMessage(data.message || "That code is invalid or has expired.");
        return;
      }
      window.location.href = data.next || resolvePostAuthDestination(data.user || { role: "user" }, redirect);
    } catch {
      setStatus("error");
      setMessage("Could not verify this email. Try again.");
    }
  };

  const resend = async () => {
    if (!email) {
      setStatus("error");
      setMessage("Enter the email you signed up with, then try again.");
      return;
    }
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setStatus("sent");
      setMessage(data.message || "If an unverified account exists for that email, we sent a new code.");
    } catch {
      setStatus("error");
      setMessage("Could not resend the email. Try again in a minute.");
    }
  };

  const signupHref = redirect
    ? `/auth/signup?redirect=${encodeURIComponent(redirect)}`
    : "/auth/signup";

  return (
    <AuthShell>
      <a href="/" aria-label="DevLabs home" className="mb-8 inline-flex">
        <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain" />
      </a>
      <h1 className="text-[clamp(1.85rem,4vw,2.35rem)] font-extrabold leading-tight tracking-[-0.03em] text-[#050505]">
        Check your email
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-black/55">
        {email ? (
          <>
            We sent a 6-digit verification code to{" "}
            <span className="font-semibold text-[#050505]">{email}</span>. Enter it below to finish creating
            your account.
          </>
        ) : (
          <>We sent a 6-digit verification code to your inbox. Enter it below to finish creating your account.</>
        )}{" "}
        <a
          href={signupHref}
          onClick={(event) => {
            event.preventDefault();
            window.location.assign(signupHref);
          }}
          className="relative z-20 font-semibold text-[#050505] underline underline-offset-4 hover:text-[#ff7417]"
        >
          Sign up with a different email
        </a>
      </p>

      <form onSubmit={verify} className="mt-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium text-black/55">
            Verification code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            placeholder="123456"
            className={authInputClassName}
          />
        </div>

        {message && (
          <p className={`text-sm ${status === "error" || error ? "text-red-600" : "text-black/55"}`}>{message}</p>
        )}

        <button
          type="submit"
          disabled={status === "verifying"}
          className="flex h-[3.35rem] w-full items-center justify-center gap-2 rounded-none border-2 border-[#050505] bg-[#050505] text-sm font-extrabold text-white shadow-[0_16px_36px_rgba(5,5,5,0.12)] transition-[background-color,color,border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-black hover:bg-white hover:text-[#050505] hover:shadow-[0_18px_40px_rgba(5,5,5,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black disabled:translate-y-0 disabled:opacity-60"
        >
          {status === "verifying" && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify email
        </button>
      </form>

      <button
        type="button"
        onClick={resend}
        disabled={status === "sending"}
        className="mt-4 w-full text-center text-sm font-semibold text-[#050505] underline-offset-4 hover:text-[#ff7417] hover:underline disabled:opacity-60"
      >
        {status === "sending" ? "Sending a new code…" : status === "sent" ? "Code sent" : "Resend code"}
      </button>

      <a
        href={signupHref}
        onClick={(event) => {
          event.preventDefault();
          window.location.assign(signupHref);
        }}
        className="relative z-20 mt-4 flex h-[3.35rem] w-full items-center justify-center rounded-none border-2 border-[#050505] bg-transparent text-sm font-extrabold text-[#050505] transition-[background-color,color,transform] duration-300 hover:-translate-y-0.5 hover:bg-[#050505] hover:text-white"
      >
        Sign up with a different email
      </a>
    </AuthShell>
  );
};

export default AuthCheckEmailPage;
