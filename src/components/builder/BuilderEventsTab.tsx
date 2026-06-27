import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ExternalLink, Loader2 } from 'lucide-react';
import { OsPageHeader, OsEmptyState } from '@/components/os';
import EventRegistrationFlow from '@/components/events/EventRegistrationFlow';
import type { EventPublicData, FormResponseValue } from '@/lib/talent/eventTypes';
import type { BuilderDashboardContext } from './types';

type BuilderRegistration = {
  _id: string;
  eventId: string;
  event: EventPublicData | null;
  responses: Record<string, FormResponseValue>;
  status: string;
  submittedAt?: string | null;
};

export default function BuilderEventsTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const [events, setEvents] = useState<EventPublicData[]>([]);
  const [registrations, setRegistrations] = useState<BuilderRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState<
    (EventPublicData & { formSchema?: { fields?: import('@/lib/talent/eventTypes').EventFormField[] } }) | null
  >(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const registrationMap = useMemo(
    () => new Map(registrations.map((reg) => [reg.eventId, reg])),
    [registrations]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, regsRes] = await Promise.all([
        fetch('/api/events/public?status=open', { credentials: 'include' }),
        fetch('/api/events/registrations/me', { credentials: 'include' }),
      ]);
      const eventsData = await eventsRes.json();
      const regsData = await regsRes.json();
      if (eventsData.success) setEvents(eventsData.events || []);
      if (regsData.success) setRegistrations(regsData.registrations || []);
    } catch (error) {
      console.error('Failed to load events', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventSlug = params.get('event');
    if (eventSlug && events.length > 0) {
      const match = events.find((event) => event.slug === eventSlug);
      if (match) setSelectedEventId(match._id);
    }
  }, [events]);

  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEventDetail(null);
      return;
    }

    const selected = events.find((event) => event._id === selectedEventId);
    if (!selected?.slug) return;

    setLoadingDetail(true);
    fetch(`/api/events/public/${selected.slug}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setSelectedEventDetail(data.event);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedEventId, events]);

  const submitRegistration = async (responses: Record<string, FormResponseValue>) => {
    if (!selectedEventId) throw new Error('No event selected');
    const res = await fetch('/api/events/registrations', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: selectedEventId, responses }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.message || 'Registration failed') as Error & {
        errors?: Record<string, string>;
      };
      err.errors = data.errors;
      throw err;
    }
    await loadData();
  };

  if (selectedEventId && selectedEventDetail) {
    const existing = registrationMap.get(selectedEventId);
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSelectedEventId(null)}
          className="text-sm text-white/60 hover:text-white"
        >
          ← Back to events
        </button>
        {loadingDetail ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#fa7d22]" />
          </div>
        ) : (
          <EventRegistrationFlow
            event={selectedEventDetail}
            builder={ctx.builder}
            existingRegistration={existing || null}
            onCompleteProfile={() => ctx.setActiveTab('profile')}
            onSubmit={submitRegistration}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OsPageHeader
        title="Events"
        description="Register for DevLabs hackathons, hacker houses, and builder programs."
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#fa7d22]" />
        </div>
      ) : events.length === 0 ? (
        <OsEmptyState
          title="No open events right now"
          description="Check back soon for upcoming DevLabs experiences."
        />
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const registered = registrationMap.has(event._id);
            return (
              <div
                key={event._id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col md:flex-row"
              >
                {event.headerImageUrl ? (
                  <img
                    src={event.headerImageUrl}
                    alt={event.name}
                    className="w-full md:w-56 h-40 object-cover"
                  />
                ) : (
                  <div className="w-full md:w-56 h-40 bg-white/5 flex items-center justify-center text-white/30 text-sm">
                    No image
                  </div>
                )}
                <div className="p-5 flex-1 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-white">{event.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        registered
                          ? 'bg-green-500/15 text-green-300 border border-green-400/20'
                          : 'bg-white/5 text-white/60 border border-white/10'
                      }`}
                    >
                      {registered ? 'Registered' : 'Open'}
                    </span>
                  </div>
                  <p className="text-sm text-white/60 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {event.date ? new Date(event.date).toLocaleDateString() : 'Date TBA'}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                  {event.description ? (
                    <p className="text-sm text-white/50 line-clamp-2">{event.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {event.websiteUrl ? (
                      <a
                        href={event.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-[#fa7d22]"
                      >
                        Website <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(event._id)}
                      className="ml-auto px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-medium"
                    >
                      {registered ? 'View registration' : 'Register'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
