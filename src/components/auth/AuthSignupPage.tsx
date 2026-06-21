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

export const AuthSignupPage: React.FC = () => {
  return (
    <AuthProvider>
      <AuthShell>
        <img src="/logo.png" alt="DevLabs" className="mb-8 h-11 w-11 rounded-xl object-contain" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Signup to Get Started</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Use the email associated with your DevLabs events, or enter your current email to get
          started.
        </p>

        <div className="mt-8">
          <EmailAuthForm mode="signup" />
          <OrDivider />
          <SocialRow />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/auth/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Log in
          </a>
        </p>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <a href="/terms" className="underline">Terms of use</a> &{" "}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </AuthShell>
    </AuthProvider>
  );
};

export default AuthSignupPage;
