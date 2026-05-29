import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth_manager';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const [oauthError, setOauthError] = useState<string | null>(null);

  const handleSuccess = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    window.location.href = redirect || '/dashboard';
  };

  const handleSwitchToRegister = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    window.location.href = `/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`;
  };

  return (
    <AuthProvider>
      <LoginPageContent oauthError={oauthError} setOauthError={setOauthError} onSuccess={handleSuccess} onSwitchToRegister={handleSwitchToRegister} />
    </AuthProvider>
  );
}

function LoginPageContent({
  oauthError,
  setOauthError,
  onSuccess,
  onSwitchToRegister,
}: {
  oauthError: string | null;
  setOauthError: (msg: string | null) => void;
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}) {
  const { user, loading } = useAuth();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');

    if (error) {
      const errorMessages: Record<string, string> = {
        oauth_init_failed: 'Failed to initialize OAuth login. Please try again.',
        oauth_no_code: 'OAuth authorization was cancelled or failed.',
        oauth_state_mismatch: 'Security validation failed. Please try again.',
        oauth_user_fetch_failed: 'Failed to retrieve user information from Google.',
        oauth_callback_failed: 'Login failed. Please try again.',
      };

      setOauthError(errorMessages[error] || 'An unknown error occurred during login.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setOauthError]);

  useEffect(() => {
    if (loading || !user) return;
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    window.location.href = redirect || '/dashboard';
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="w-8 h-8 border-2 border-[#fa7d22]/30 border-t-[#fa7d22] rounded-full animate-spin" />
        <p className="text-white/60 text-sm">Checking session…</p>
      </div>
    );
  }

  return (
    <>
      {oauthError && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg backdrop-blur-sm">
          {oauthError}
        </div>
      )}
      <LoginForm onSuccess={onSuccess} onSwitchToRegister={onSwitchToRegister} />
    </>
  );
}
