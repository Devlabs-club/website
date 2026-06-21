import React, { useState } from "react";

function currentRedirectParam(): string {
  if (typeof window === "undefined") return "";
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect || "";
}

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
    <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
    <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
    <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
    <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
  </svg>
);

const IconButton: React.FC<{ onClick?: () => void; disabled?: boolean; label: string; children: React.ReactNode }> = ({
  onClick,
  disabled,
  label,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="flex h-12 w-16 items-center justify-center rounded-xl border border-border bg-background transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

/** Social provider icon row (Google, Microsoft). */
export const SocialRow: React.FC = () => {
  const [redirecting, setRedirecting] = useState(false);

  const go = (path: string, provider?: "google") => {
    setRedirecting(true);
    const url = new URL(path, window.location.origin);
    if (provider) url.searchParams.set("provider", provider);
    const redirect = currentRedirectParam();
    if (redirect) url.searchParams.set("redirect", redirect);
    window.location.href = `${url.pathname}${url.search}`;
  };

  return (
    <div className="flex items-center justify-center gap-3">
      <IconButton label="Continue with Google" disabled={redirecting} onClick={() => go("/api/auth/oauth/login", "google")}>
        <GoogleIcon />
      </IconButton>
      <IconButton label="Microsoft (coming soon)" disabled>
        <MicrosoftIcon />
      </IconButton>
    </div>
  );
};

export default SocialRow;
