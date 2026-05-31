import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth_manager';
import EventRegistrationFlow from '@/components/events/EventRegistrationFlow';
import type { EventPublicData, FormResponseValue } from '@/lib/talent/eventTypes';
import type { BuilderData } from '@/components/builder/types';

export default function EventRegistrationPage({ slug }: { slug: string }) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<
    (EventPublicData & { formSchema?: { fields?: import('@/lib/talent/eventTypes').EventFormField[] } }) | null
  >(null);
  const [builder, setBuilder] = useState<BuilderData | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<{
    responses: Record<string, FormResponseValue>;
    status: string;
    submittedAt?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const redirect = encodeURIComponent(`/events/${slug}/register`);
      window.location.href = `/login?redirect=${redirect}`;
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventRes, dashRes, regsRes] = await Promise.all([
          fetch(`/api/events/public/${slug}`, { credentials: 'include' }),
          fetch('/api/agent/actions', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_builder_dashboard', payload: {} }),
          }),
          fetch('/api/events/registrations/me', { credentials: 'include' }),
        ]);

        const eventData = await eventRes.json();
        const dashData = await dashRes.json();
        const regsData = await regsRes.json();

        if (!eventRes.ok || !eventData.success) {
          throw new Error(eventData.message || 'Event not available for registration');
        }

        setEvent(eventData.event);
        if (dashData.success) setBuilder(dashData.builder || null);

        if (regsData.success) {
          const match = (regsData.registrations || []).find(
            (reg: { event?: { slug?: string } | null }) => reg.event?.slug === slug
          );
          if (match) {
            setExistingRegistration({
              responses: match.responses || {},
              status: match.status,
              submittedAt: match.submittedAt,
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, user, slug]);

  const submitRegistration = async (responses: Record<string, FormResponseValue>) => {
    if (!event) throw new Error('Event not loaded');
    const res = await fetch('/api/events/registrations', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event._id, responses }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.message || 'Registration failed') as Error & {
        errors?: Record<string, string>;
      };
      err.errors = data.errors;
      throw err;
    }
    setExistingRegistration({
      responses: data.registration.responses,
      status: data.registration.status,
      submittedAt: data.registration.submittedAt,
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#fa7d22]" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-semibold text-white mb-2">Registration unavailable</h1>
        <p className="text-white/60">{error || 'This event could not be loaded.'}</p>
        <a href="/dashboard?tab=events" className="inline-block mt-6 text-[#fa7d22]">
          Go to Builder OS events
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <EventRegistrationFlow
        event={event}
        builder={builder}
        existingRegistration={existingRegistration}
        onCompleteProfile={() => {
          window.location.href = '/dashboard?tab=profile';
        }}
        onSubmit={submitRegistration}
      />
    </div>
  );
}
