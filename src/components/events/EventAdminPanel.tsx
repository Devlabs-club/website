import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Download, ExternalLink, Loader2, Plus, Save } from 'lucide-react';
import EventFormFieldBuilder from './EventFormFieldBuilder';
import type {
  EventFormField,
  EventPublicData,
  EventType,
  RegistrationStatus,
} from '@/lib/talent/eventTypes';
import { EVENT_TYPES, slugifyEventName } from '@/lib/talent/eventTypes';
import {
  adminGhostButtonClass,
  adminInputClass,
  adminLabelClass,
  adminMutedClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSubPanelClass,
} from '@/components/admin/adminUi';
import { OsBadge, OsEmptyState, OsPageHeader } from '@/components/os';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const showToast = {
  success: (message: string) => {
    try {
      const { toast } = require('react-hot-toast');
      toast.success(message);
    } catch {
      console.log('✓', message);
    }
  },
  error: (message: string) => {
    try {
      const { toast } = require('react-hot-toast');
      toast.error(message);
    } catch {
      console.error('✗', message);
    }
  },
};

type AdminRegistration = {
  _id: string;
  builderName: string;
  builderEmail: string;
  builderHeadline?: string | null;
  responses: Record<string, unknown>;
  status: string;
  submittedAt?: string | null;
};

const emptyDraft = (): Partial<EventPublicData> & { formFields: EventFormField[] } => ({
  name: '',
  slug: '',
  date: new Date().toISOString().slice(0, 10),
  endDate: '',
  type: 'hackathon',
  location: '',
  description: '',
  websiteUrl: '',
  headerImageUrl: '',
  registrationStatus: 'draft',
  registrationOpensAt: '',
  registrationClosesAt: '',
  formFields: [],
});

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusBadge(status: RegistrationStatus) {
  if (status === 'open') return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
  if (status === 'closed') return 'bg-white/5 text-white/50 border-white/10';
  return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
}

export default function EventAdminPanel() {
  const [events, setEvents] = useState<EventPublicData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [registrations, setRegistrations] = useState<AdminRegistration[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [view, setView] = useState<'list' | 'editor' | 'registrations'>('list');

  const selectedEvent = useMemo(
    () => events.find((event) => event._id === selectedId) || null,
    [events, selectedId]
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/events/admin/events', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load events');
      setEvents(data.events || []);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRegistrations = useCallback(async (eventId: string) => {
    setLoadingRegistrations(true);
    try {
      const res = await fetch(`/api/events/admin/registrations?eventId=${eventId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load registrations');
      setRegistrations(data.registrations || []);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to load registrations');
    } finally {
      setLoadingRegistrations(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const openCreate = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setView('editor');
  };

  const openEdit = (event: EventPublicData & { formSchema?: { fields?: EventFormField[] } }) => {
    setSelectedId(event._id);
    setDraft({
      ...event,
      date: event.date ? event.date.slice(0, 10) : '',
      endDate: event.endDate ? event.endDate.slice(0, 10) : '',
      registrationOpensAt: toDatetimeLocal(event.registrationOpensAt),
      registrationClosesAt: toDatetimeLocal(event.registrationClosesAt),
      formFields: event.formSchema?.fields || [],
    });
    setView('editor');
  };

  const openRegistrations = async (event: EventPublicData) => {
    setSelectedId(event._id);
    setView('registrations');
    await loadRegistrations(event._id);
  };

  const handleHeaderUpload = async (file: File) => {
    setUploadingHeader(true);
    try {
      const formData = new FormData();
      formData.append('header', file);
      const res = await fetch('/api/events/admin/events/upload-header', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Upload failed');
      setDraft((prev) => ({ ...prev, headerImageUrl: data.headerImageUrl }));
      showToast.success('Header image uploaded');
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadingHeader(false);
    }
  };

  const saveEvent = async () => {
    if (!draft.name?.trim()) return showToast.error('Event name is required');
    if (!draft.date) return showToast.error('Event date is required');
    if (!draft.websiteUrl?.trim()) return showToast.error('Website URL is required');

    setSaving(true);
    try {
      const payload = {
        ...(selectedId ? { eventId: selectedId } : {}),
        name: draft.name,
        slug: draft.slug || slugifyEventName(draft.name),
        date: draft.date,
        endDate: draft.endDate || null,
        type: draft.type,
        location: draft.location || null,
        description: draft.description || null,
        websiteUrl: draft.websiteUrl,
        headerImageUrl: draft.headerImageUrl || null,
        registrationStatus: draft.registrationStatus,
        registrationOpensAt: draft.registrationOpensAt || null,
        registrationClosesAt: draft.registrationClosesAt || null,
        formSchema: { fields: draft.formFields || [] },
      };

      const res = await fetch('/api/events/admin/events', {
        method: selectedId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Save failed');

      showToast.success(selectedId ? 'Event updated' : 'Event created');
      await loadEvents();
      setSelectedId(data.event._id);
      setDraft({
        ...data.event,
        date: data.event.date ? data.event.date.slice(0, 10) : '',
        endDate: data.event.endDate ? data.event.endDate.slice(0, 10) : '',
        registrationOpensAt: toDatetimeLocal(data.event.registrationOpensAt),
        registrationClosesAt: toDatetimeLocal(data.event.registrationClosesAt),
        formFields: data.event.formSchema?.fields || [],
      });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (status: RegistrationStatus) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/events/admin/events', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedId, registrationStatus: status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Update failed');
      showToast.success(status === 'open' ? 'Registration opened' : 'Registration closed');
      await loadEvents();
      setDraft((prev) => ({ ...prev, registrationStatus: status }));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!selectedEvent || registrations.length === 0) return;

    const fieldLabels = (selectedEvent.formSchema?.fields || []).reduce<Record<string, string>>(
      (acc, field) => {
        acc[field.id] = field.label;
        return acc;
      },
      {}
    );

    const headers = ['Name', 'Email', 'Headline', 'Status', 'Submitted At', ...Object.values(fieldLabels)];
    const rows = registrations.map((reg) => {
      const responseValues = Object.keys(fieldLabels).map((fieldId) => {
        const value = reg.responses[fieldId];
        if (Array.isArray(value)) return value.join('; ');
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        return value ?? '';
      });
      return [
        reg.builderName,
        reg.builderEmail,
        reg.builderHeadline || '',
        reg.status,
        reg.submittedAt || '',
        ...responseValues,
      ];
    });

    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedEvent.slug || 'event'}-registrations.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && view === 'list') {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[#fa7d22]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OsPageHeader
        eyebrow="Admin"
        title="Event Registration"
        subtitle="Create events, build registration forms, upload headers, and review submissions."
        actions={
          <div className="flex gap-2">
            {view !== 'list' ? (
              <button type="button" onClick={() => setView('list')} className={adminSecondaryButtonClass()}>
                Back to list
              </button>
            ) : null}
            <button type="button" onClick={openCreate} className={adminPrimaryButtonClass()}>
              <Plus className="w-4 h-4" />
              New event
            </button>
          </div>
        }
      />

      {view === 'list' ? (
        <div className="grid gap-4">
          {events.length === 0 ? (
            <OsEmptyState
              title="No events yet"
              description="Create your first registration event with a custom form and header image."
              action={
                <button type="button" onClick={openCreate} className={adminPrimaryButtonClass()}>
                  Create event
                </button>
              }
            />
          ) : (
            events.map((event) => (
              <div
                key={event._id}
                className={`${adminPanelClass} p-4 flex flex-col md:flex-row md:items-center gap-4`}
              >
                {event.headerImageUrl ? (
                  <img
                    src={event.headerImageUrl}
                    alt={event.name}
                    className="w-full md:w-44 h-28 object-cover rounded-2xl border border-white/10"
                  />
                ) : (
                  <div className="w-full md:w-44 h-28 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/30 text-xs">
                    No header
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{event.name}</h3>
                    <Badge className={statusBadge(event.registrationStatus)}>{event.registrationStatus}</Badge>
                  </div>
                  <p className={`${adminMutedClass} flex items-center gap-2`}>
                    <Calendar className="w-4 h-4" />
                    {event.date ? new Date(event.date).toLocaleDateString() : 'No date'}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                  {event.websiteUrl ? (
                    <a
                      href={event.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-[#fa7d22] hover:text-orange-300"
                    >
                      Event website <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                  <p className="text-xs text-white/35">/events/{event.slug}/register</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(event as EventPublicData & { formSchema?: { fields?: EventFormField[] } })}
                    className={adminSecondaryButtonClass()}
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => openRegistrations(event)} className={adminSecondaryButtonClass()}>
                    Registrations
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {view === 'editor' ? (
        <Tabs defaultValue="details" className="space-y-6">
          <TabsList className="rounded-full border border-white/10 bg-white/[0.03] p-1 h-auto">
            <TabsTrigger
              value="details"
              className="rounded-full px-4 py-2 data-[state=active]:bg-[#fa7d22] data-[state=active]:text-black text-white/70"
            >
              Event details
            </TabsTrigger>
            <TabsTrigger
              value="form"
              className="rounded-full px-4 py-2 data-[state=active]:bg-[#fa7d22] data-[state=active]:text-black text-white/70"
            >
              Registration form
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-0">
            <div className={`${adminPanelClass} p-5 space-y-5`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className={adminLabelClass}>Event name *</span>
                  <input
                    className={adminInputClass}
                    value={draft.name || ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        name: e.target.value,
                        slug: prev.slug || slugifyEventName(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>Slug</span>
                  <input
                    className={adminInputClass}
                    value={draft.slug || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>Start date *</span>
                  <input
                    type="date"
                    className={adminInputClass}
                    value={draft.date || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>End date</span>
                  <input
                    type="date"
                    className={adminInputClass}
                    value={draft.endDate || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>Type</span>
                  <select
                    className={adminInputClass}
                    value={draft.type || 'hackathon'}
                    onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as EventType }))}
                  >
                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>Location</span>
                  <input
                    className={adminInputClass}
                    value={draft.location || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, location: e.target.value }))}
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className={adminLabelClass}>Website URL *</span>
                  <input
                    className={adminInputClass}
                    value={draft.websiteUrl || ''}
                    placeholder="https://devhacks.devlabs.club"
                    onChange={(e) => setDraft((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className={adminLabelClass}>Description</span>
                  <textarea
                    className={`${adminInputClass} min-h-[100px] resize-y`}
                    value={draft.description || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>Registration opens</span>
                  <input
                    type="datetime-local"
                    className={adminInputClass}
                    value={draft.registrationOpensAt || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, registrationOpensAt: e.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className={adminLabelClass}>Registration closes</span>
                  <input
                    type="datetime-local"
                    className={adminInputClass}
                    value={draft.registrationClosesAt || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, registrationClosesAt: e.target.value }))}
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className={adminLabelClass}>Header image</span>
                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingHeader}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleHeaderUpload(file);
                      }}
                      className="text-sm text-white/60"
                    />
                    {uploadingHeader ? <Loader2 className="w-4 h-4 animate-spin text-[#fa7d22]" /> : null}
                  </div>
                  {draft.headerImageUrl ? (
                    <img
                      src={draft.headerImageUrl}
                      alt="Event header"
                      className="mt-3 h-32 w-full max-w-md object-cover rounded-2xl border border-white/10"
                    />
                  ) : null}
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="form" className="mt-0">
            <div className={`${adminPanelClass} p-5`}>
              <EventFormFieldBuilder
                fields={draft.formFields || []}
                onChange={(fields) => setDraft((prev) => ({ ...prev, formFields: fields }))}
              />
            </div>
          </TabsContent>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={saveEvent} className={adminPrimaryButtonClass(saving)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save event
            </button>
            {selectedId ? (
              <>
                <button type="button" disabled={saving} onClick={() => updateStatus('open')} className={adminSecondaryButtonClass()}>
                  Publish / Open
                </button>
                <button type="button" disabled={saving} onClick={() => updateStatus('closed')} className={adminGhostButtonClass()}>
                  Close registration
                </button>
              </>
            ) : null}
          </div>
        </Tabs>
      ) : null}

      {view === 'registrations' && selectedEvent ? (
        <div className={`${adminPanelClass} p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">{selectedEvent.name}</h3>
              <p className={adminMutedClass}>{registrations.length} registrations</p>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={registrations.length === 0}
              className={adminSecondaryButtonClass()}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {loadingRegistrations ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[#fa7d22]" />
            </div>
          ) : registrations.length === 0 ? (
            <OsEmptyState animateTitle={false} title="No registrations yet" description="Submissions will appear here once builders register." />
          ) : (
            <div className={`${adminSubPanelClass} overflow-x-auto`}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/45 border-b border-white/10">
                    <th className="py-3 px-4">Builder</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((reg) => (
                    <tr key={reg._id} className="border-b border-white/5 text-white/80">
                      <td className="py-3 px-4">{reg.builderName}</td>
                      <td className="py-3 px-4">{reg.builderEmail}</td>
                      <td className="py-3 px-4">
                        <OsBadge>{reg.status}</OsBadge>
                      </td>
                      <td className="py-3 px-4">
                        {reg.submittedAt ? new Date(reg.submittedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
