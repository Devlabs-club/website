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

type AuthLoginPageProps = {
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

function oauthErrorMessage(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const reason = params.get("reason");
  if (!error) return null;

  const messages: Record<string, string> = {
    oauth_provider_disabled: "That sign-in provider is not enabled.",
    oauth_init_failed: "Could not start Google sign-in. Check the local auth configuration and try again.",
    oauth_provider_error: reason ? decodeURIComponent(reason) : "Google sign-in was cancelled or rejected.",
    oauth_no_code: "Google sign-in did not return an authorization code.",
    oauth_user_fetch_failed: "Google sign-in completed, but the user profile could not be loaded.",
    oauth_callback_failed: "Google sign-in completed, but DevLabs could not finish creating your session.",
  };

  return messages[error] || "Sign-in failed. Please try again.";
}

export const AuthLoginPage: React.FC<AuthLoginPageProps> = ({ redirect }) => {
  const oauthError = oauthErrorMessage();

  return (
    <AuthProvider>
      <AuthShell>
        <a href="/" aria-label="DevLabs home" className="mb-8 inline-flex">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain" />
        </a>
        <h1 className="text-[clamp(1.85rem,4vw,2.35rem)] font-extrabold leading-tight tracking-[-0.03em] text-[#050505]">
          Welcome back
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-black/55">
          Log in to continue to DevLabs — the community-backed hiring platform for founders.
        </p>
        {oauthError && (
          <p className="mt-5 rounded-xl border border-red-300/50 bg-red-50 px-4 py-3 text-sm text-red-700">
            {oauthError}
          </p>
        )}

        <div className="mt-8">
          <EmailAuthForm mode="login" />
          <OrDivider />
          <SocialRow label="Continue with Google" />
        </div>

        <p className="mt-8 text-center text-xs text-black/45">
          New to DevLabs?{" "}
          <a
            href={authSwitchHref("/auth/signup", redirect)}
            className="font-semibold text-[#050505] underline-offset-4 hover:text-[#ff7417] hover:underline"
          >
            Sign up
          </a>
        </p>
      </AuthShell>
    </AuthProvider>
  );
};

export default AuthLoginPage;
