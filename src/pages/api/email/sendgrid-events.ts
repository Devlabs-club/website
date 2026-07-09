import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import TalentEmailDelivery from '@/models/talent/TalentEmailDelivery';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asDate(value: unknown) {
  if (typeof value === 'number') return new Date(value * 1000);
  return new Date();
}

function eventField(event: string) {
  if (event === 'delivered') return { at: 'deliveredAt', count: 'eventCounts.delivered', status: 'delivered' };
  if (event === 'open') return { at: 'openedAt', count: 'eventCounts.open', status: 'opened' };
  if (event === 'click') return { at: 'clickedAt', count: 'eventCounts.click', status: 'clicked' };
  if (event === 'bounce') return { at: 'bouncedAt', count: 'eventCounts.bounce', status: 'bounced' };
  if (event === 'dropped') return { at: 'droppedAt', count: 'eventCounts.dropped', status: 'dropped' };
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const expected = process.env.SENDGRID_EVENT_WEBHOOK_SECRET?.trim();
  if (expected) {
    const provided = request.headers.get('x-devlabs-sendgrid-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== expected) return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const events = (await request.json().catch(() => null)) as any;
  if (!Array.isArray(events)) return json({ success: false, error: 'Expected SendGrid event array.' }, 400);

  await connectAdminDB();
  let updated = 0;
  for (const event of events) {
    const eventName = String(event?.event || '');
    const field = eventField(eventName);
    if (!field) continue;

    const providerMessageId = String(event?.sg_message_id || event?.['smtp-id'] || '').split('.')[0] || null;
    const threadId = event?.threadId || event?.custom_args?.threadId || null;
    const introRequestId = event?.introRequestId || event?.custom_args?.introRequestId || null;
    const matchRecordId = event?.matchRecordId || event?.custom_args?.matchRecordId || null;
    const email = String(event?.email || '').toLowerCase().trim();
    const emailType = event?.emailType || event?.custom_args?.emailType || null;
    const occurredAt = asDate(event?.timestamp);

    const query: Record<string, unknown> = providerMessageId
      ? { providerMessageId }
      : {
          ...(email ? { to: email } : {}),
          ...(threadId ? { threadId } : {}),
          ...(introRequestId ? { introRequestId } : {}),
          ...(matchRecordId ? { matchRecordId } : {}),
          ...(emailType ? { emailType } : {}),
        };
    if (!Object.keys(query).length) continue;

    const result = await TalentEmailDelivery.updateOne(query, {
      $set: {
        [field.at]: occurredAt,
        status: field.status,
        lastEventAt: occurredAt,
        ...(event?.reason ? { lastError: String(event.reason) } : {}),
      },
      $inc: { [field.count]: 1 },
    });
    if (result.modifiedCount) updated += 1;
  }

  return json({ success: true, received: events.length, updated });
};
