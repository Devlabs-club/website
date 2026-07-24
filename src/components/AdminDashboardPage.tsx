import React from 'react';
import { AuthProvider } from './auth_manager';
import AdminDashboard from './AdminDashboard';

export default function AdminDashboardPage() {
  return (
    <AuthProvider>
      <AdminDashboard />
    </AuthProvider>
  );
}
