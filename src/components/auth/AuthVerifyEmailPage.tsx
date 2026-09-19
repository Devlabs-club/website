import React, { useEffect, useRef, useState } from "react";
import { AuthShell } from "./AuthShell";
import { Loader2 } from "lucide-react";

type AuthVerifyEmailPageProps = {
  token?: string;
  redirect?: string;
};

export const AuthVerifyEmailPage: React.FC<AuthVerifyEmailPageProps> = ({
  token: initialToken,
  redirect,
}) => {
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("Verifying your email…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token =
      initialToken ||
      (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : "") ||
      "";

    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing a token.");
      return;
    }

    const run = async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, redirect: redirect || null }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          setStatus("error");
          setMessage(data.message || "This verification link is invalid or has expired.");
          return;
        }
        window.location.href = data.next || "/auth/select-role";
      } catch {
        setStatus("error");
        setMessage("Could not verify this email. Try the link again.");
      }
    };

    void run();
  }, [initialToken, redirect]);

  return (
    <AuthShell>
      <a href="/" aria-label="DevLabs home" className="mb-8 inline-flex">
        <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain" />
      </a>
      <h1 className="text-[clamp(1.85rem,4vw,2.35rem)] font-extrabold leading-tight tracking-[-0.03em] text-[#050505]">
        {status === "working" ? "Verifying email" : "Could not verify"}
      </h1>
      <p className="mt-3 flex items-center gap-2 text-sm leading-relaxed text-black/55">
        {status === "working" && <Loader2 className="h-4 w-4 animate-spin" />}
        {message}
      </p>
      {status === "error" && (
        <a
          href="/auth/check-email"
          className="mt-8 flex h-[3.35rem] w-full items-center justify-center rounded-none border-2 border-[#050505] bg-[#050505] text-sm font-extrabold text-white"
        >
          Request a new link
        </a>
      )}
    </AuthShell>
  );
};

export default AuthVerifyEmailPage;
