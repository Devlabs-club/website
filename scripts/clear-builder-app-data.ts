/**
 * Remove Builder OS activity data for a user while keeping BuilderProfile intact.
 *
 * Usage:
 *   bun run scripts/clear-builder-app-data.ts dhanush.kalaiselvan@gmial.com
 *   bun run scripts/clear-builder-app-data.ts --dry-run dhanush.kalaiselvan@gmail.com
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/user.tsx';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import MatchRecord from '../src/models/talent/MatchRecord';
import IntroRequest from '../src/models/talent/IntroRequest';
import MessageThread from '../src/models/talent/MessageThread';
import Message from '../src/models/talent/Message';
import Notification from '../src/models/talent/Notification';
import CallSchedule from '../src/models/talent/CallSchedule';
import FeedbackRecord from '../src/models/talent/FeedbackRecord';
import EventRegistration from '../src/models/talent/EventRegistration';
import MomentumUpdate from '../src/models/talent/MomentumUpdate';
import Shortlist from '../src/models/talent/Shortlist';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const ADMIN_MONGO_URI = process.env.ADMIN_MONGO_URI;
if (!ADMIN_MONGO_URI) {
  console.error('ADMIN_MONGO_URI is not set');
  process.exit(1);
}

function emailVariants(raw: string): string[] {
  const base = raw.toLowerCase().trim();
  const variants = new Set<string>([base]);
  if (base.includes('@gmial.com')) {
    variants.add(base.replace('@gmial.com', '@gmail.com'));
  }
  if (base.includes('@gmail.com')) {
    variants.add(base.replace('@gmail.com', '@gmial.com'));
  }
  return [...variants];
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const emailArg = args[0];

  if (!emailArg) {
    console.error('Usage: bun run scripts/clear-builder-app-data.ts [--dry-run] <email>');
    process.exit(1);
  }

  const emails = emailVariants(emailArg);
  console.log(`Looking up: ${emails.join(', ')}${dryRun ? ' (dry run)' : ''}`);

  await mongoose.connect(ADMIN_MONGO_URI as string);

  const user = await User.findOne({ email: { $in: emails } }).lean();
  if (!user) {
    console.error('No User document found for those emails.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const builder = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: { $in: emails } }],
  });

  if (!builder) {
    console.error(`User found (${user.email}) but no BuilderProfile. Nothing to clear.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const builderId = builder._id;
  console.log(`User: ${user.email} (${user._id})`);
  console.log(`Builder: ${builder.name} (${builder.email}) — ${builderId}`);
  console.log('Profile fields will NOT be modified.\n');

  const threadIds = (
    await MessageThread.find({ builderId }).select('_id').lean()
  ).map((t) => t._id);

  const counts = {
    matchRecords: await MatchRecord.countDocuments({ builderId }),
    introRequests: await IntroRequest.countDocuments({ builderId }),
    messageThreads: threadIds.length,
    messages: threadIds.length
      ? await Message.countDocuments({ threadId: { $in: threadIds } })
      : 0,
    notifications: await Notification.countDocuments({ builderId }),
    callSchedules: await CallSchedule.countDocuments({ builderId }),
    feedbackRecords: await FeedbackRecord.countDocuments({ builderId }),
    eventRegistrations: await EventRegistration.countDocuments({ builderId }),
    momentumUpdates: await MomentumUpdate.countDocuments({ builderId }),
    shortlistsWithCandidate: await Shortlist.countDocuments({
      $or: [{ 'candidates.builderId': builderId }, { hiddenBuilderIds: builderId }],
    }),
  };

  console.log('Documents to remove / update:');
  console.table(counts);

  if (dryRun) {
    await mongoose.disconnect();
    return;
  }

  const deleted = {
    messages: threadIds.length
      ? (await Message.deleteMany({ threadId: { $in: threadIds } })).deletedCount
      : 0,
    messageThreads: (await MessageThread.deleteMany({ builderId })).deletedCount,
    matchRecords: (await MatchRecord.deleteMany({ builderId })).deletedCount,
    introRequests: (await IntroRequest.deleteMany({ builderId })).deletedCount,
    notifications: (await Notification.deleteMany({ builderId })).deletedCount,
    callSchedules: (await CallSchedule.deleteMany({ builderId })).deletedCount,
    feedbackRecords: (await FeedbackRecord.deleteMany({ builderId })).deletedCount,
    eventRegistrations: (await EventRegistration.deleteMany({ builderId })).deletedCount,
    momentumUpdates: (await MomentumUpdate.deleteMany({ builderId })).deletedCount,
  };

  const shortlistPull = await Shortlist.updateMany(
    { 'candidates.builderId': builderId },
    { $pull: { candidates: { builderId } } }
  );
  const shortlistHiddenPull = await Shortlist.updateMany(
    { hiddenBuilderIds: builderId },
    { $pull: { hiddenBuilderIds: builderId } }
  );

  console.log('\nDeleted:');
  console.table(deleted);
  console.log(
    `Shortlists updated: candidates=${shortlistPull.modifiedCount}, hidden=${shortlistHiddenPull.modifiedCount}`
  );
  console.log('\nDone. Builder profile and project records were left unchanged.');
  console.log(
    'Note: agent chat history is stored in browser localStorage — clear site data or re-login in a fresh session if needed.'
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
