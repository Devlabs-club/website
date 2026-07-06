/**
 * Reset a builder to "new user" state by email.
 * Usage: bun run scripts/reset-builder-by-email.ts dhanush.kalaiselvan@gmail.com
 */
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import BuilderProfileClaim from '../src/models/talent/BuilderProfileClaim';
import ImessageConversation from '../src/models/talent/ImessageConversation';
import BuilderAgentMemory from '../src/models/talent/BuilderAgentMemory';
import PhoneVerification from '../src/models/talent/PhoneVerification';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import TalentEmbedding from '../src/models/talent/TalentEmbedding';
import AgentWrappedReport from '../src/models/talent/AgentWrappedReport';

const email = (process.argv[2] || '').toLowerCase().trim();
if (!email) {
  console.error('Usage: bun run scripts/reset-builder-by-email.ts <email>');
  process.exit(1);
}

async function run() {
  await connectAdminDB();

  const builder = (await BuilderProfile.findOne({ email }).lean()) as { _id?: unknown; phone?: string | null } | null;
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
    results.builderAgentMemories = (await BuilderAgentMemory.deleteMany({ builderId })).deletedCount || 0;
    results.agentWrappedReports = (await AgentWrappedReport.deleteMany({ builderId })).deletedCount || 0;
    results.imessageConversationsByBuilder = (
      await ImessageConversation.deleteMany({ builderId })
    ).deletedCount || 0;
  } else {
    results.builderProfiles = 0;
  }

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

  console.log(`Reset builder data for ${email}:`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`Builder id: ${builderId || '(none)'}`);
  console.log(`Handles cleared: ${[...handles].join(', ')}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
