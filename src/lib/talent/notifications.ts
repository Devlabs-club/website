import Notification from '@/models/talent/Notification';
import type { NOTIFICATION_TYPES } from '@/models/talent/Notification';
import { sendTalentEmail, dashboardDeepLink } from '@/lib/talent/talentEmail';

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type CreateNotificationParams = {
  recipientType: 'founder' | 'builder';
  recipientEmail: string;
  builderId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  entityType?: 'IntroRequest' | 'CallSchedule' | 'MatchRecord' | 'Opportunity';
  entityId?: string | null;
};

function serializeNotification(doc: any) {
  return {
    _id: String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link || '/dashboard',
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
    entityType: doc.entityType || null,
    entityId: doc.entityId ? String(doc.entityId) : null,
  };
}

export async function createNotification(params: CreateNotificationParams) {
  const doc = await Notification.create({
    recipientType: params.recipientType,
    recipientEmail: params.recipientEmail.toLowerCase().trim(),
    builderId: params.builderId || null,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link || '/dashboard',
    entityType: params.entityType || null,
    entityId: params.entityId || null,
  });

  const tabFromLink = params.link?.includes('tab=')
    ? params.link.split('tab=')[1]?.split('&')[0]
    : params.recipientType === 'builder'
      ? 'home'
      : 'messages';
  await sendTalentEmail({
    to: params.recipientEmail,
    subject: params.title,
    body: `${params.body} View this on your builder dashboard.`,
    ctaLabel: 'Open dashboard',
    ctaUrl: dashboardDeepLink(tabFromLink || 'home'),
  });

  return serializeNotification(doc);
}

export async function getNotificationsForFounder(email: string, limit = 30) {
  const docs = await Notification.find({ recipientEmail: email.toLowerCase().trim() })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs.map(serializeNotification);
}

export async function getNotificationsForBuilder(builderId: string, limit = 30) {
  const docs = await Notification.find({ builderId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs.map(serializeNotification);
}

export async function countUnreadForFounder(email: string) {
  return Notification.countDocuments({
    recipientEmail: email.toLowerCase().trim(),
    readAt: null,
  });
}

export async function countUnreadForBuilder(builderId: string) {
  return Notification.countDocuments({
    builderId,
    readAt: null,
  });
}

export async function markNotificationRead(
  notificationId: string,
  recipient: { type: 'founder'; email: string } | { type: 'builder'; builderId: string }
) {
  const query: Record<string, unknown> = { _id: notificationId, readAt: null };
  if (recipient.type === 'founder') {
    query.recipientEmail = recipient.email.toLowerCase().trim();
  } else {
    query.builderId = recipient.builderId;
  }
  const doc = await Notification.findOneAndUpdate(query, { $set: { readAt: new Date() } }, { new: true });
  return doc ? serializeNotification(doc) : null;
}

export async function markAllNotificationsRead(
  recipient: { type: 'founder'; email: string } | { type: 'builder'; builderId: string }
) {
  const query: Record<string, unknown> = { readAt: null };
  if (recipient.type === 'founder') {
    query.recipientEmail = recipient.email.toLowerCase().trim();
  } else {
    query.builderId = recipient.builderId;
  }
  await Notification.updateMany(query, { $set: { readAt: new Date() } });
}

export function builderDashboardLink(tab: string, params?: Record<string, string>) {
  const search = new URLSearchParams({ tab, ...params });
  return `/dashboard?${search.toString()}`;
}

export function founderDashboardLink(params?: Record<string, string>) {
  const search = new URLSearchParams(params);
  const qs = search.toString();
  return qs ? `/dashboard?${qs}` : '/dashboard';
}
