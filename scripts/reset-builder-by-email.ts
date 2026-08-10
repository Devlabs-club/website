/**
 * Reset a user to "new user" state by email (builder + founder talent data,
 * and User.accountType / role / onboardingStatus so they hit select-role again).
 * Usage: bun run scripts/reset-builder-by-email.ts dhanush.kalaiselvan@gmail.com
 */
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import User from '../src/models/user';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import BuilderProfileClaim from '../src/models/talent/BuilderProfileClaim';
import FounderProfile from '../src/models/talent/FounderProfile';
import ImessageConversation from '../src/models/talent/ImessageConversation';
import BuilderAgentMemory from '../src/models/talent/BuilderAgentMemory';
import PhoneVerification from '../src/models/talent/PhoneVerification';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import TalentEmbedding from '../src/models/talent/TalentEmbedding';
import TalentSearchIndex from '../src/models/talent/TalentSearchIndex';
import TalentSearchKey from '../src/models/talent/TalentSearchKey';
import AgentWrappedReport from '../src/models/talent/AgentWrappedReport';
import ContributionRecord from '../src/models/talent/ContributionRecord';
import FeedbackRecord from '../src/models/talent/FeedbackRecord';
import MatchRecord from '../src/models/talent/MatchRecord';
import IntroRequest from '../src/models/talent/IntroRequest';
import CallSchedule from '../src/models/talent/CallSchedule';
import Notification from '../src/models/talent/Notification';
import Shortlist from '../src/models/talent/Shortlist';
import TalentEmailDelivery from '../src/models/talent/TalentEmailDelivery';

const email = (process.argv[2] || '').toLowerCase().trim();
if (!email) {
  console.error('Usage: bun run scripts/reset-builder-by-email.ts <email>');
  process.exit(1);
}

async function run() {
  await connectAdminDB();

  const user = (await User.findOne({ email }).lean()) as {
    _id?: unknown;
    role?: string;
    accountType?: string | null;
    onboardingStatus?: string | null;
  } | null;
  const userId = user?._id ? String(user._id) : null;

  const builder = (await BuilderProfile.findOne({
    $or: [{ email }, ...(userId ? [{ userId }] : [])],
  }).lean()) as { _id?: unknown; phone?: string | null; userId?: string } | null;
  const builderId = builder?._id ? String(builder._id) : null;
  const phone = builder?.phone || null;

  const claimFilter = { builderEmail: email };
  const claims = await BuilderProfileClaim.find(claimFilter).lean();
  const claimPhones = claims.map((c) => c.phone).filter(Boolean) as string[];

  const handles = new Set<string>([email]);
  if (phone) handles.add(phone);
  for (const p of claimPhones) handles.add(p);

  const results: Record<string, number> = {};

  if (builderId) {
    results.builderProfiles = (await BuilderProfile.deleteOne({ _id: builderId })).deletedCount || 0;
    results.projectRecords = (await ProjectRecord.deleteMany({ builderId })).deletedCount || 0;
    results.talentEmbeddings = (await TalentEmbedding.deleteMany({ builderId })).deletedCount || 0;
    results.talentSearchIndexes = (await TalentSearchIndex.deleteMany({ builderId })).deletedCount || 0;
    results.talentSearchKeys = (await TalentSearchKey.deleteMany({ builderId })).deletedCount || 0;
    results.contributionRecords = (await ContributionRecord.deleteMany({ builderId })).deletedCount || 0;
    results.feedbackRecords = (await FeedbackRecord.deleteMany({ builderId })).deletedCount || 0;
    results.matchRecords = (await MatchRecord.deleteMany({ builderId })).deletedCount || 0;
    results.introRequests = (await IntroRequest.deleteMany({ builderId })).deletedCount || 0;
    results.callSchedules = (await CallSchedule.deleteMany({ builderId })).deletedCount || 0;
    results.notifications = (await Notification.deleteMany({ builderId })).deletedCount || 0;
    results.talentEmailDeliveries = (await TalentEmailDelivery.deleteMany({ builderId })).deletedCount || 0;
    results.builderAgentMemories = (await BuilderAgentMemory.deleteMany({ builderId })).deletedCount || 0;
    results.agentWrappedReports = (await AgentWrappedReport.deleteMany({ builderId })).deletedCount || 0;
    results.imessageConversationsByBuilder = (
      await ImessageConversation.deleteMany({ builderId })
    ).deletedCount || 0;
    const shortlistUpdate = await Shortlist.updateMany(
      {
        $or: [
          { hiddenBuilderIds: builderId },
          { 'candidates.builderId': builderId },
        ],
      },
      {
        $pull: {
          hiddenBuilderIds: builderId,
          candidates: { builderId },
        },
      }
    );
    results.shortlistsTouched = shortlistUpdate.modifiedCount || 0;
  } else {
    results.builderProfiles = 0;
  }

  // Also clear any orphan builder rows keyed only by userId/email
  if (userId) {
    results.builderProfilesByUserId =
      (await BuilderProfile.deleteMany({ userId })).deletedCount || 0;
  }
  results.builderProfilesByEmail = (await BuilderProfile.deleteMany({ email })).deletedCount || 0;

  results.founderProfiles =
    (await FounderProfile.deleteMany({
      $or: [{ founderEmail: email }, ...(userId ? [{ userId }] : [])],
    })).deletedCount || 0;

  results.builderProfileClaims = (await BuilderProfileClaim.deleteMany(claimFilter)).deletedCount || 0;
  results.phoneVerifications = (await PhoneVerification.deleteMany({ email })).deletedCount || 0;

  for (const handle of handles) {
    const n = (await ImessageConversation.deleteMany({ handle })).deletedCount || 0;
    results.imessageConversationsByHandle = (results.imessageConversationsByHandle || 0) + n;
  }

  for (const p of claimPhones) {
    results.phoneVerificationsByPhone =
      (results.phoneVerificationsByPhone || 0) +
      ((await PhoneVerification.deleteMany({ phone: p })).deletedCount || 0);
  }

  if (userId) {
    const updated = await User.updateOne(
      { _id: userId },
      {
        $set: {
          role: 'user',
          accountType: null,
          onboardingStatus: null,
        },
      }
    );
    results.userReset = updated.modifiedCount || 0;
  } else {
    results.userReset = 0;
  }

  console.log(`Reset to new-user state for ${email}:`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`User id: ${userId || '(none)'} (was role=${user?.role || 'n/a'} accountType=${user?.accountType ?? 'n/a'})`);
  console.log(`Builder id: ${builderId || '(none)'}`);
  console.log(`Handles cleared: ${[...handles].join(', ')}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
