import React, { useState } from "react";
import { useAuth } from "@/components/auth_manager";
import { Loader2 } from "lucide-react";

interface Props {
  mode: "signup" | "login";
}

function postAuthDestination(): string {
  if (typeof window === "undefined") return "/auth/select-role";
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect || "/auth/select-role";
}

/**
 * Minimal email-first auth (matches the wireframe): enter email -> Continue
 * reveals a password field -> submit creates the account or logs in.
 */
export const EmailAuthForm: React.FC<Props> = ({ mode }) => {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!showPassword) {
      if (!emailValid) {
        setError("Enter a valid email to continue.");
        return;
      }
      setShowPassword(true);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const name = email.split("@")[0];
    const result =
      mode === "signup"
        ? await register(name, email.trim(), password)
        : await login(email.trim(), password);
    setLoading(false);

    if (result.success) {
      window.location.href = postAuthDestination();
    } else {
      setError(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm text-muted-foreground">
          Work email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. kavya@devlabs.in"
          autoComplete="email"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
        />
      </div>

      {showPassword && (
        <div className="animate-fade-in space-y-2">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {showPassword ? (mode === "signup" ? "Create account" : "Log in") : "Continue"}
      </button>
    </form>
  );
};

export default EmailAuthForm;
