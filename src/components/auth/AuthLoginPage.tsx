import React from "react";
import { AuthProvider } from "@/components/auth_manager";
import { AuthShell } from "./AuthShell";
import { EmailAuthForm } from "./EmailAuthForm";
import { SocialRow } from "./SocialRow";

const OrDivider = () => (
  <div className="relative my-6 flex items-center justify-center">
    <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
    <span className="relative bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">
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
        <img src="/logo.png" alt="DevLabs" className="mb-8 h-11 w-11 rounded-xl object-contain" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Log in to continue to DevLabs.
        </p>
        {oauthError && (
          <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {oauthError}
          </p>
        )}

        <div className="mt-8">
          <EmailAuthForm mode="login" />
          <OrDivider />
          <SocialRow label="Sign in with Google" />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          New to DevLabs?{" "}
          <a href={authSwitchHref("/auth/signup", redirect)} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </a>
        </p>
      </AuthShell>
    </AuthProvider>
  );
};

export default AuthLoginPage;
