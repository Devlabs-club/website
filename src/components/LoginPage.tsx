import React from 'react';
import { AuthProvider } from './auth_manager';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const handleSuccess = () => {
    window.location.href = '/dashboard';
  };

  const handleSwitchToRegister = () => {
    window.location.href = '/register';
  };

  return (
    <AuthProvider>
      <LoginForm
        onSuccess={handleSuccess}
        onSwitchToRegister={handleSwitchToRegister}
      />
    </AuthProvider>
  );
}
