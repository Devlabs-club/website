import React from 'react';
import { AuthProvider } from '@/components/auth_manager';
import EventRegistrationPage from './EventRegistrationPage';

export default function EventRegistrationPageWrapper({ slug }: { slug: string }) {
  return (
    <AuthProvider>
      <EventRegistrationPage slug={slug} />
    </AuthProvider>
  );
}
