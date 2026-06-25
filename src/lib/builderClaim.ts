import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { sendBuilderClaimMessage } from '@/lib/builderClaimMessaging';
import { findUserByEmail, updateUserAccount } from '@/lib/adminMongo';
import { checkSmsVerification, startSmsVerification } from '@/lib/twilioVerify';

const CLAIM_TTL_DAYS = 14;
const OTP_MAX_ATTEMPTS = 5;

export function normalizeClaimEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeClaimPhone(phone: string) {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function isPlausibleClaimPhone(phone: string) {
  return /^\+\d{10,15}$/.test(phone);
}

export function createClaimToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashClaimSecret(secret: string) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function generatePhoneCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function claimBaseUrl(runtime?: RuntimeEnv) {
  return (
    readEnv('WEBSITE_ROOT', runtime) ||
    readEnv('PUBLIC_URL', runtime) ||
    'https://devlabs.club'
  ).replace(/\/$/, '');
}

export function claimUrlForToken(token: string, runtime?: RuntimeEnv) {
  return `${claimBaseUrl(runtime)}/builder/claim/${encodeURIComponent(token)}`;
}

export async function createBuilderClaimForEmail(email: string, runtime?: RuntimeEnv) {
  const builderEmail = normalizeClaimEmail(email);
  const builder = await BuilderProfile.findOne({ email: builderEmail }).select('_id email name').lean();
  const token = createClaimToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000);

  const claim = await BuilderProfileClaim.create({
    builderId: builder?._id || null,
    builderEmail,
    tokenHash: hashClaimSecret(token),
    status: 'email_sent',
    expiresAt,
    metadata: {
      source: 'claim_email',
      builderName: builder?.name || null,
    },
  });

  return {
    token,
    url: claimUrlForToken(token, runtime),
    claim,
    builder,
  };
}

export async function findClaimByRawToken(rawToken: string) {
  const claim = await BuilderProfileClaim.findOne({ tokenHash: hashClaimSecret(rawToken) });
  if (!claim) return null;
  if (claim.expiresAt && claim.expiresAt.getTime() < Date.now() && claim.status !== 'expired') {
    claim.status = 'expired';
    await claim.save();
  }
  return claim;
}

export async function serializeClaim(claim: any) {
  const builder = claim.builderId
    ? await BuilderProfile.findById(claim.builderId).select('name headline email links verificationStatus').lean()
    : await BuilderProfile.findOne({ email: claim.builderEmail }).select('name headline email links verificationStatus').lean();

  return {
    id: String(claim._id),
    builderEmail: claim.builderEmail,
    builderName: builder?.name || claim.metadata?.builderName || 'Builder',
    headline: builder?.headline || null,
    status: claim.status,
    phone: claim.phone || null,
    phoneVerifiedAt: claim.phoneVerifiedAt ? new Date(claim.phoneVerifiedAt).toISOString() : null,
    expiresAt: claim.expiresAt ? new Date(claim.expiresAt).toISOString() : null,
  };
}

export async function requestClaimPhoneVerification(rawToken: string, phoneInput: string, runtime?: RuntimeEnv) {
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return { error: 'Claim link was not found.', status: 404 as const };
  if (claim.status === 'expired') return { error: 'Claim link has expired.', status: 410 as const };
  if (claim.status === 'completed') return { error: 'This builder profile was already claimed.', status: 409 as const };

  const phone = normalizeClaimPhone(phoneInput);
  if (!isPlausibleClaimPhone(phone)) {
    return { error: 'Enter a valid phone number, including country code if outside the US.', status: 400 as const };
  }

  const verification = await startSmsVerification(phone, runtime);
  claim.phone = phone;
  claim.status = 'phone_pending';
  claim.phoneVerificationProvider = 'twilio_verify';
  claim.phoneVerificationSid = verification.sid;
  claim.phoneVerificationStatus = verification.status;
  claim.phoneVerificationCodeHash = null;
  claim.phoneVerificationExpiresAt = null;
  claim.phoneVerificationAttempts = 0;

  claim.messages.push({
    direction: 'outbound',
    body: 'Sent DevLabs builder claim verification code by SMS.',
    channel: 'sms',
    providerMessageId: verification.sid,
  });
  claim.lastMessageAt = new Date();
  await claim.save();

  return {
    claim,
    delivery: { status: 'sent' as const, providerMessageId: verification.sid },
    debugCode: null,
  };
}

export async function verifyClaimPhone(rawToken: string, codeInput: string, runtime?: RuntimeEnv) {
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return { error: 'Claim link was not found.', status: 404 as const };
  if (claim.status === 'expired') return { error: 'Claim link has expired.', status: 410 as const };
  if (claim.status === 'completed') return { error: 'This builder profile was already claimed.', status: 409 as const };
  if (!claim.phone || claim.phoneVerificationProvider !== 'twilio_verify') {
    return { error: 'Request a phone verification code first.', status: 400 as const };
  }
  if (claim.phoneVerificationAttempts >= OTP_MAX_ATTEMPTS) {
    return { error: 'Too many attempts. Request a new code.', status: 429 as const };
  }

  claim.phoneVerificationAttempts += 1;
  const verification = await checkSmsVerification(claim.phone, codeInput.trim(), runtime);
  claim.phoneVerificationSid = verification.sid || claim.phoneVerificationSid;
  claim.phoneVerificationStatus = verification.status;
  if (!verification.approved) {
    await claim.save();
    return { error: 'Incorrect verification code.', status: 400 as const };
  }

  claim.status = 'phone_verified';
  claim.phoneVerifiedAt = new Date();
  claim.phoneVerificationCodeHash = null;
  claim.phoneVerificationExpiresAt = null;

  const user = await findUserByEmail(claim.builderEmail, runtime);
  if (user?._id) {
    await updateUserAccount(String(user._id), {
      phone: claim.phone,
    }, runtime);
  }

  if (claim.builderId && mongoose.Types.ObjectId.isValid(String(claim.builderId))) {
    await BuilderProfile.updateOne(
      { _id: claim.builderId },
      {
        $set: {
          ...(user?._id ? { userId: user._id } : {}),
          phone: claim.phone,
          email: claim.builderEmail,
        },
      }
    );
  }

  await claim.save();
  const start = await startClaimConversation(claim, runtime);
  return { claim, delivery: start.delivery };
}

export async function requestClaimConversationStart(rawToken: string, runtime?: RuntimeEnv) {
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return { error: 'Claim link was not found.', status: 404 as const };
  if (claim.status === 'expired') return { error: 'Claim link has expired.', status: 410 as const };
  if (claim.status === 'completed') return { error: 'This builder profile was already claimed.', status: 409 as const };
  if (!claim.phoneVerifiedAt || !claim.phone) {
    return { error: 'Verify your phone number first.', status: 400 as const };
  }

  const start = await startClaimConversation(claim, runtime);
  return { claim, delivery: start.delivery };
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || 'there';
}

async function getClaimBuilder(claim: any) {
  if (claim.builderId) return BuilderProfile.findById(claim.builderId).lean();
  return BuilderProfile.findOne({ email: claim.builderEmail }).lean();
}

function claimQuestions(builder: any) {
  const name = builder?.name || 'this DevLabs builder profile';
  const links = [builder?.links?.linkedin, builder?.links?.github, builder?.links?.devpost].filter(Boolean).join(' / ');
  return [
    {
      key: 'identity',
      body: `Hi ${firstName(builder?.name || '')}, this is DevLabs. Reply YES to confirm you are claiming the builder profile for ${name}.`,
    },
    {
      key: 'links',
      body: links
        ? `Reply with the LinkedIn/GitHub/Devpost link that belongs to you. We have this on file: ${links}`
        : 'Reply with the LinkedIn, GitHub, or Devpost link that belongs to you.',
    },
    {
      key: 'proof',
      body: 'Reply with one project, role, or experience from your profile so we can cross-check the claim.',
    },
  ];
}

export async function startClaimConversation(claim: any, runtime?: RuntimeEnv) {
  const builder = await getClaimBuilder(claim);
  const question = claimQuestions(builder)[0];
  const delivery = await sendBuilderClaimMessage(
    {
      toPhone: claim.phone,
      body: question.body,
      claimId: String(claim._id),
      builderId: claim.builderId ? String(claim.builderId) : null,
      purpose: 'claim_conversation',
    },
    runtime
  );

  claim.status = delivery.status === 'sent' ? 'conversation_started' : 'phone_verified';
  claim.conversationQuestionIndex = 0;
  claim.messages.push({
    direction: 'outbound',
    body: question.body,
    channel: 'imessage',
    providerMessageId: delivery.status === 'sent' ? delivery.providerMessageId || null : null,
  });
  claim.lastMessageAt = new Date();
  await claim.save();

  return { delivery };
}

function normalizeCheckText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/www\./g, '')
    .replace(/[^a-z0-9./@_-]+/g, ' ')
    .trim();
}

async function validateClaimAnswer(claim: any, answer: string, questionIndex: number) {
  const builder = await getClaimBuilder(claim);
  if (questionIndex === 0) {
    return /^(yes|y|confirm|confirmed|that'?s me|this is me)\b/i.test(answer.trim());
  }

  if (!builder) return answer.trim().length >= 3;

  const normalizedAnswer = normalizeCheckText(answer);
  if (questionIndex === 1) {
    const links = [builder.links?.linkedin, builder.links?.github, builder.links?.devpost, builder.email]
      .filter(Boolean)
      .map(normalizeCheckText)
      .filter(Boolean);
    return links.some((link) => normalizedAnswer.includes(link) || link.includes(normalizedAnswer));
  }

  const projects = await ProjectRecord.find({ builderId: builder._id }).select('projectName description techStack').limit(10).lean();
  const profileText = normalizeCheckText(
    [
      builder.headline,
      builder.bio,
      builder.universityOrCompany,
      ...(builder.rolePreference || []),
      ...(builder.experiences || []).flatMap((exp: any) => [exp.title, exp.company, exp.description, ...(exp.skills || [])]),
      ...projects.flatMap((project: any) => [project.projectName, project.description, ...(project.techStack || [])]),
    ].join(' ')
  );
  const meaningfulTerms = normalizedAnswer.split(/\s+/).filter((term) => term.length >= 4);
  if (meaningfulTerms.length === 0) return false;
  return meaningfulTerms.some((term) => profileText.includes(term));
}

export async function advanceClaimConversation(params: { fromPhone: string; body: string; providerMessageId?: string | null }, runtime?: RuntimeEnv) {
  const phone = normalizeClaimPhone(params.fromPhone);
  const claim = await BuilderProfileClaim.findOne({
    phone,
    status: { $in: ['phone_verified', 'conversation_started'] },
  }).sort({ updatedAt: -1 });

  if (!claim) return { error: 'No active claim found for this phone number.', status: 404 as const };

  const body = params.body.trim();
  if (params.providerMessageId) {
    const alreadyHandled = claim.messages.some((message: any) => message.direction === 'inbound' && message.providerMessageId === params.providerMessageId);
    if (alreadyHandled) return { claim, completed: false, delivery: { status: 'not_configured' as const } };
  }

  claim.messages.push({
    direction: 'inbound',
    body,
    channel: 'imessage',
    providerMessageId: params.providerMessageId || null,
  });

  const builder = await getClaimBuilder(claim);
  const questions = claimQuestions(builder);
  const currentIndex = Math.min(claim.conversationQuestionIndex || 0, questions.length - 1);
  const valid = await validateClaimAnswer(claim, body, currentIndex);
  if (!valid) {
    const failure = `Question ${currentIndex + 1} did not match expected profile evidence.`;
    claim.conversationFailures.push(failure);
    const failuresForQuestion = claim.conversationFailures.filter((item: string) => item === failure).length;
    if (failuresForQuestion > 3) {
      claim.lastMessageAt = new Date();
      await claim.save();
      return { claim, completed: false, delivery: { status: 'not_configured' as const } };
    }
    const retryBody = 'I could not match that to the profile yet. Please reply with the exact requested detail from your DevLabs builder profile.';
    const retryDelivery = await sendBuilderClaimMessage(
      {
        toPhone: phone,
        body: retryBody,
        claimId: String(claim._id),
        builderId: claim.builderId ? String(claim.builderId) : null,
        purpose: 'claim_conversation',
      },
      runtime
    );
    claim.messages.push({
      direction: 'outbound',
      body: retryBody,
      channel: 'imessage',
      providerMessageId: retryDelivery.status === 'sent' ? retryDelivery.providerMessageId || null : null,
    });
    claim.lastMessageAt = new Date();
    await claim.save();
    return { claim, completed: false, delivery: retryDelivery };
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= questions.length) {
    const completeBody = 'Thanks. Your phone number is verified and your DevLabs builder profile claim is complete.';
    const completeDelivery = await sendBuilderClaimMessage(
      {
        toPhone: phone,
        body: completeBody,
        claimId: String(claim._id),
        builderId: claim.builderId ? String(claim.builderId) : null,
        purpose: 'claim_conversation',
      },
      runtime
    );
    claim.status = 'completed';
    claim.completedAt = new Date();
    claim.messages.push({
      direction: 'outbound',
      body: completeBody,
      channel: 'imessage',
      providerMessageId: completeDelivery.status === 'sent' ? completeDelivery.providerMessageId || null : null,
    });
    claim.lastMessageAt = new Date();
    if (claim.builderId) {
      const user = await findUserByEmail(claim.builderEmail, runtime);
      await BuilderProfile.updateOne(
        { _id: claim.builderId },
        {
          $set: {
            ...(user?._id ? { userId: user._id } : {}),
            phone,
            email: claim.builderEmail,
            verificationStatus: 'builder_confirmed',
          },
        }
      );
      if (user?._id) {
        await updateUserAccount(String(user._id), {
          role: 'builder',
          accountType: 'builder',
          onboardingStatus: 'complete',
        }, runtime);
      }
    }
    await claim.save();
    return { claim, completed: true, delivery: completeDelivery };
  }

  const nextQuestion = questions[nextIndex];
  const delivery = await sendBuilderClaimMessage(
    {
      toPhone: phone,
      body: nextQuestion.body,
      claimId: String(claim._id),
      builderId: claim.builderId ? String(claim.builderId) : null,
      purpose: 'claim_conversation',
    },
    runtime
  );
  claim.status = 'conversation_started';
  claim.conversationQuestionIndex = nextIndex;
  claim.messages.push({
    direction: 'outbound',
    body: nextQuestion.body,
    channel: 'imessage',
    providerMessageId: delivery.status === 'sent' ? delivery.providerMessageId || null : null,
  });
  claim.lastMessageAt = new Date();
  await claim.save();
  return { claim, completed: false, delivery };
}
