import React, { useState } from "react";
import { useAuth } from "@/components/auth_manager";
import { resolvePostAuthDestination } from "@/lib/authDestination";
import { Loader2 } from "lucide-react";

interface Props {
  mode: "signup" | "login";
}

function redirectParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("redirect");
}

function emailParam(): string {
  if (typeof window === "undefined") return "";
  return String(new URLSearchParams(window.location.search).get("email") || "").trim();
}

const authInputClassName =
  "h-[3.35rem] w-full rounded-none border border-border bg-card px-4 text-foreground shadow-[0_14px_24px_rgba(0,0,0,0.04)] outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_14px_24px_rgba(255,116,23,0.12)]";

/**
 * Minimal email-first auth (matches the wireframe): enter email -> Continue
 * reveals a password field -> submit creates the account or logs in.
 */
export const EmailAuthForm: React.FC<Props> = ({ mode }) => {
  const { login, register } = useAuth();
  const [email, setEmail] = useState(emailParam);
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
      window.location.href = resolvePostAuthDestination(
        result.user || { accountType: null, role: "user" },
        redirectParam()
      );
    } else {
      setError(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-black/55">
          Work email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. kavya@devlabs.in"
          autoComplete="email"
          className={authInputClassName}
        />
      </div>

      {showPassword && (
        <div className="animate-fade-in space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-black/55">
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
            className={authInputClassName}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex h-[3.35rem] w-full items-center justify-center gap-2 rounded-none border-2 border-[#050505] bg-[#050505] text-sm font-extrabold text-white shadow-[0_16px_36px_rgba(5,5,5,0.12)] transition-[background-color,color,border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-black hover:bg-white hover:text-[#050505] hover:shadow-[0_18px_40px_rgba(5,5,5,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black disabled:translate-y-0 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {showPassword ? (mode === "signup" ? "Create account" : "Log in") : "Continue"}
      </button>
    </form>
  );
};

export default EmailAuthForm;
