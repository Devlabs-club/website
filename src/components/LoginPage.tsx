import React, { useState, useEffect } from 'react';
import { AuthProvider } from './auth_manager';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for OAuth error in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error) {
      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        oauth_init_failed: 'Failed to initialize OAuth login. Please try again.',
        oauth_no_code: 'OAuth authorization was cancelled or failed.',
        oauth_state_mismatch: 'Security validation failed. Please try again.',
        oauth_user_fetch_failed: 'Failed to retrieve user information from Google.',
        oauth_callback_failed: 'Login failed. Please try again.'
      };
      
      setOauthError(errorMessages[error] || 'An unknown error occurred during login.');
      
      // Clean up URL after showing error
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSuccess = () => {
    window.location.href = '/dashboard';
  };

  const handleSwitchToRegister = () => {
    window.location.href = '/register';
  };

  return (
    <AuthProvider>
      {oauthError && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg backdrop-blur-sm">
          {oauthError}
        </div>
      )}
      <LoginForm
        onSuccess={handleSuccess}
        onSwitchToRegister={handleSwitchToRegister}
      />
    </AuthProvider>
  );
}
