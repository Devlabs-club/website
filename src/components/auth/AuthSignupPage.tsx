import React from "react";
import { AuthProvider } from "@/components/auth_manager";
import { AuthShell } from "./AuthShell";
import { EmailAuthForm } from "./EmailAuthForm";
import { SocialRow } from "./SocialRow";

const OrDivider = () => (
  <div className="relative my-6 flex items-center justify-center">
    <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/10" />
    <span className="relative bg-[#fbf6f3] px-3 text-xs font-semibold uppercase tracking-[0.14em] text-black/40">
      Or
    </span>
  </div>
);

type AuthSignupPageProps = {
  redirect?: string;
};

function authSwitchHref(path: "/auth/login" | "/auth/signup", initialRedirect?: string) {
  const redirect =
    initialRedirect ||
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("redirect") : "");
  if (!redirect) return path;
  const params = new URLSearchParams({ redirect });
  return `${path}?${params.toString()}`;
}

export const AuthSignupPage: React.FC<AuthSignupPageProps> = ({ redirect }) => {
  return (
    <AuthProvider>
      <AuthShell>
        <a href="/" aria-label="DevLabs home" className="mb-8 inline-flex">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain" />
        </a>
        <h1 className="text-[clamp(1.85rem,4vw,2.35rem)] font-extrabold leading-tight tracking-[-0.03em] text-[#050505]">
          Welcome to Devlabs
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-black/55">
          Use the email associated with your DevLabs events, or enter your current email to get
          started.
        </p>

        <div className="mt-8">
          <EmailAuthForm mode="signup" />
          <OrDivider />
          <SocialRow label="Continue with Google" />
        </div>

        <p className="mt-8 text-center text-xs text-black/45">
          Already have an account?{" "}
          <a
            href={authSwitchHref("/auth/login", redirect)}
            className="font-semibold text-[#050505] underline-offset-4 hover:text-[#ff7417] hover:underline"
          >
            Log in
          </a>
        </p>
        <p className="mt-6 text-center text-xs text-black/45">
          By continuing you agree to our{" "}
          <a href="/terms" className="underline underline-offset-2 hover:text-[#ff7417]">
            Terms of use
          </a>{" "}
          &{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-[#ff7417]">
            Privacy Policy
          </a>
          .
        </p>
      </AuthShell>
    </AuthProvider>
  );
};

export default AuthSignupPage;
