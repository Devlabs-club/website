import React from 'react';
import { AuthProvider } from './auth_manager';
import { RegisterForm } from './RegisterForm';

export default function RegisterPage() {
  const handleSuccess = () => {
    window.location.href = '/dashboard';
  };

  const handleSwitchToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthProvider>
      <RegisterForm
        onSuccess={handleSuccess}
        onSwitchToLogin={handleSwitchToLogin}
      />
    </AuthProvider>
  );
}
