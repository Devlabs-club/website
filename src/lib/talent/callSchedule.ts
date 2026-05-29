import CallSchedule from '@/models/talent/CallSchedule';
import MatchRecord from '@/models/talent/MatchRecord';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import {
  builderDashboardLink,
  createNotification,
  founderDashboardLink,
} from '@/lib/talent/notifications';
import { syncMatchPipelineStatus } from '@/lib/talent/founderPipeline';

function serializeSlot(slot: any) {
  if (!slot?.startAt) return null;
  return {
    startAt: new Date(slot.startAt).toISOString(),
    endAt: new Date(slot.endAt).toISOString(),
    timezone: slot.timezone || 'UTC',
  };
}

export function serializeCallSchedule(doc: any) {
  return {
    _id: String(doc._id),
    opportunityId: String(doc.opportunityId),
    builderId: String(doc.builderId),
    matchRecordId: doc.matchRecordId ? String(doc.matchRecordId) : null,
    introRequestId: doc.introRequestId ? String(doc.introRequestId) : null,
    status: doc.status,
    proposedBy: doc.proposedBy,
    proposedSlot: serializeSlot(doc.proposedSlot),
    confirmedSlot: serializeSlot(doc.confirmedSlot),
    meetingUrl: doc.meetingUrl || null,
    notes: doc.notes || null,
    rescheduleCount: doc.rescheduleCount || 0,
    callCompletedAt: doc.callCompletedAt ? new Date(doc.callCompletedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

function parseSlot(input: any) {
  const startAt = input?.startAt ? new Date(input.startAt) : null;
  const endAt = input?.endAt ? new Date(input.endAt) : null;
  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return null;
  }
  if (endAt <= startAt) return null;
  return {
    startAt,
    endAt,
    timezone: String(input.timezone || 'UTC').trim() || 'UTC',
  };
}

function formatSlotLabel(slot: { startAt: Date; endAt: Date; timezone?: string }) {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  return new Date(slot.startAt).toLocaleString(undefined, opts);
}

async function loadCallContext(opportunityId: string, builderId: string, founderEmail: string) {
  const [opportunity, builder, match, intro] = await Promise.all([
    Opportunity.findOne({ _id: opportunityId, founderEmail }).lean(),
    BuilderProfile.findById(builderId).lean(),
    MatchRecord.findOne({ opportunityId, builderId }),
    IntroRequest.findOne({ opportunityId, builderId }),
  ]);
  if (!opportunity || !builder || !match) {
    return { error: 'Match or opportunity not found', status: 404 as const };
  }
  if (intro && intro.status !== 'builder_accepted' && match.status !== 'interviewing' && match.status !== 'offer' && match.status !== 'trial' && match.status !== 'hired') {
    if (match.status !== 'builder_interested') {
      return { error: 'Builder must accept intro before scheduling a call', status: 400 as const };
    }
  }
  return { opportunity, builder, match, intro };
}

export async function scheduleCallByFounder(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  slot: { startAt: string; endAt: string; timezone?: string };
  meetingUrl?: string;
  notes?: string;
}) {
  const ctx = await loadCallContext(params.opportunityId, params.builderId, params.founderEmail);
  if ('error' in ctx) return ctx;

  const parsedSlot = parseSlot(params.slot);
  if (!parsedSlot) return { error: 'Valid start and end times are required', status: 400 as const };

  const { opportunity, builder, match, intro } = ctx;

  const schedule = await CallSchedule.findOneAndUpdate(
    { opportunityId: params.opportunityId, builderId: params.builderId },
    {
      $set: {
        opportunityId: params.opportunityId,
        builderId: params.builderId,
        matchRecordId: match._id,
        introRequestId: intro?._id || null,
        proposedSlot: parsedSlot,
        confirmedSlot: null,
        status: 'pending_builder',
        proposedBy: 'founder',
        meetingUrl: params.meetingUrl?.trim() || null,
        notes: params.notes?.trim() || null,
      },
    },
    { upsert: true, new: true }
  );

  syncMatchPipelineStatus(match, 'interviewing');
  await match.save();

  await createNotification({
    recipientType: 'builder',
    recipientEmail: builder.email,
    builderId: String(builder._id),
    type: 'call_scheduled',
    title: 'Intro call proposed',
    body: `${params.founderEmail.split('@')[0]} proposed a call for ${formatSlotLabel(parsedSlot)}.`,
    link: builderDashboardLink('calls', { callId: String(schedule._id) }),
    entityType: 'CallSchedule',
    entityId: String(schedule._id),
  });

  return { schedule: serializeCallSchedule(schedule), match };
}

export async function respondCallScheduleByBuilder(params: {
  callScheduleId: string;
  builderId: string;
  action: 'accept' | 'counter';
  slot?: { startAt: string; endAt: string; timezone?: string };
  notes?: string;
}) {
  const schedule = await CallSchedule.findOne({ _id: params.callScheduleId, builderId: params.builderId });
  if (!schedule) return { error: 'Call schedule not found', status: 404 as const };

  const [builder, opportunity, match] = await Promise.all([
    BuilderProfile.findById(params.builderId).lean(),
    Opportunity.findById(schedule.opportunityId).lean(),
    MatchRecord.findOne({ opportunityId: schedule.opportunityId, builderId: schedule.builderId }),
  ]);
  if (!builder || !opportunity || !match) return { error: 'Related records not found', status: 404 as const };

  if (params.action === 'accept') {
    const slot = schedule.proposedSlot;
    if (!slot) return { error: 'No proposed slot to accept', status: 400 as const };
    schedule.confirmedSlot = slot;
    schedule.status = 'confirmed';
    await schedule.save();

    await createNotification({
      recipientType: 'founder',
      recipientEmail: opportunity.founderEmail,
      type: 'call_confirmed',
      title: 'Call confirmed',
      body: `${builder.name} confirmed the intro call for ${formatSlotLabel(slot)}.`,
      link: founderDashboardLink({
        builderId: String(schedule.builderId),
        opportunityId: String(schedule.opportunityId),
      }),
      entityType: 'CallSchedule',
      entityId: String(schedule._id),
    });

    await createNotification({
      recipientType: 'builder',
      recipientEmail: builder.email,
      builderId: String(builder._id),
      type: 'call_confirmed',
      title: 'Call confirmed',
      body: `Your intro call is confirmed for ${formatSlotLabel(slot)}.`,
      link: builderDashboardLink('calls', { callId: String(schedule._id) }),
      entityType: 'CallSchedule',
      entityId: String(schedule._id),
    });

    return { schedule: serializeCallSchedule(schedule), match };
  }

  const counterSlot = parseSlot(params.slot);
  if (!counterSlot) return { error: 'Valid counter-proposal slot is required', status: 400 as const };

  schedule.proposedSlot = counterSlot;
  schedule.confirmedSlot = null;
  schedule.status = 'pending_founder';
  schedule.proposedBy = 'builder';
  schedule.rescheduleCount = (schedule.rescheduleCount || 0) + 1;
  schedule.notes = params.notes?.trim() || schedule.notes;
  await schedule.save();

  await createNotification({
    recipientType: 'founder',
    recipientEmail: opportunity.founderEmail,
    type: 'call_rescheduled',
    title: 'Call reschedule requested',
    body: `${builder.name} proposed a new time: ${formatSlotLabel(counterSlot)}.`,
    link: founderDashboardLink({
      builderId: String(schedule.builderId),
      opportunityId: String(schedule.opportunityId),
    }),
    entityType: 'CallSchedule',
    entityId: String(schedule._id),
  });

  return { schedule: serializeCallSchedule(schedule), match };
}

export async function confirmCallScheduleByFounder(params: {
  callScheduleId: string;
  founderEmail: string;
}) {
  const schedule = await CallSchedule.findById(params.callScheduleId);
  if (!schedule) return { error: 'Call schedule not found', status: 404 as const };

  const opportunity = await Opportunity.findOne({
    _id: schedule.opportunityId,
    founderEmail: params.founderEmail,
  }).lean();
  if (!opportunity) return { error: 'Not authorized', status: 403 as const };

  if (schedule.status !== 'pending_founder') {
    return { error: 'No pending counter-proposal to confirm', status: 400 as const };
  }

  const slot = schedule.proposedSlot;
  if (!slot) return { error: 'No slot to confirm', status: 400 as const };

  schedule.confirmedSlot = slot;
  schedule.status = 'confirmed';
  await schedule.save();

  const builder = await BuilderProfile.findById(schedule.builderId).lean();
  const match = await MatchRecord.findOne({
    opportunityId: schedule.opportunityId,
    builderId: schedule.builderId,
  });

  if (builder) {
    await createNotification({
      recipientType: 'builder',
      recipientEmail: builder.email,
      builderId: String(builder._id),
      type: 'call_confirmed',
      title: 'Call confirmed',
      body: `Your intro call is confirmed for ${formatSlotLabel(slot)}.`,
      link: builderDashboardLink('calls', { callId: String(schedule._id) }),
      entityType: 'CallSchedule',
      entityId: String(schedule._id),
    });
  }

  await createNotification({
    recipientType: 'founder',
    recipientEmail: params.founderEmail,
    type: 'call_confirmed',
    title: 'Call confirmed',
    body: `Intro call confirmed for ${formatSlotLabel(slot)}.`,
    link: founderDashboardLink({
      builderId: String(schedule.builderId),
      opportunityId: String(schedule.opportunityId),
    }),
    entityType: 'CallSchedule',
    entityId: String(schedule._id),
  });

  return { schedule: serializeCallSchedule(schedule), match };
}

export async function completeCallByFounder(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
}) {
  const ctx = await loadCallContext(params.opportunityId, params.builderId, params.founderEmail);
  if ('error' in ctx) return ctx;

  const { match } = ctx;
  const schedule = await CallSchedule.findOne({
    opportunityId: params.opportunityId,
    builderId: params.builderId,
  });

  if (schedule && schedule.status !== 'confirmed' && schedule.status !== 'completed') {
    return { error: 'Call must be confirmed before marking complete', status: 400 as const };
  }

  if (schedule) {
    schedule.status = 'completed';
    schedule.callCompletedAt = new Date();
    await schedule.save();
  }

  match.callCompletedAt = new Date();
  match.pipelineNextStep = 'Hire now or start a work trial';
  await match.save();

  return { schedule: schedule ? serializeCallSchedule(schedule) : null, match };
}

export async function getBuilderUpcomingCalls(builderId: string) {
  const schedules = await CallSchedule.find({
    builderId,
    status: { $in: ['pending_builder', 'pending_founder', 'confirmed'] },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const oppIds = schedules.map((s) => s.opportunityId);
  const opportunities = await Opportunity.find({ _id: { $in: oppIds } }).lean();
  const oppById = new Map(opportunities.map((o) => [String(o._id), o]));

  return schedules.map((s) => {
    const opp = oppById.get(String(s.opportunityId));
    return {
      ...serializeCallSchedule(s),
      roleTitle: opp?.roleTitle || 'Role',
      company: opp?.company || 'Startup',
      founderName: opp?.founderName || opp?.founderEmail?.split('@')[0] || 'Founder',
    };
  });
}

export async function getCallScheduleForMatch(opportunityId: string, builderId: string) {
  const schedule = await CallSchedule.findOne({ opportunityId, builderId }).lean();
  return schedule ? serializeCallSchedule(schedule) : null;
}
