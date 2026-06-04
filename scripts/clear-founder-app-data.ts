/**
 * Remove Founder OS activity data for a founder email (keeps User account / role).
 *
 * Usage:
 *   bun run scripts/clear-founder-app-data.ts dkalaise@asu.edu
 *   bun run scripts/clear-founder-app-data.ts --dry-run dkalaise@asu.edu
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/user.tsx';
import Opportunity from '../src/models/talent/Opportunity';
import Shortlist from '../src/models/talent/Shortlist';
import MatchRecord from '../src/models/talent/MatchRecord';
import IntroRequest from '../src/models/talent/IntroRequest';
import MessageThread from '../src/models/talent/MessageThread';
import Message from '../src/models/talent/Message';
import Notification from '../src/models/talent/Notification';
import CallSchedule from '../src/models/talent/CallSchedule';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const ADMIN_MONGO_URI = process.env.ADMIN_MONGO_URI;
if (!ADMIN_MONGO_URI) {
  console.error('ADMIN_MONGO_URI is not set');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const emailArg = args[0];

  if (!emailArg) {
    console.error('Usage: bun run scripts/clear-founder-app-data.ts [--dry-run] <founder-email>');
    process.exit(1);
  }

  const founderEmail = emailArg.toLowerCase().trim();
  console.log(`Founder: ${founderEmail}${dryRun ? ' (dry run)' : ''}`);

  await mongoose.connect(ADMIN_MONGO_URI as string);

  const user = await User.findOne({ email: founderEmail }).lean();
  if (!user) {
    console.warn('No User document for this email (will still clear founder collections).');
  } else {
    console.log(`User: ${user.name} — role=${user.role}`);
    if (user.role !== 'founder') {
      console.warn('User role is not "founder"; dashboard may not load Founder OS.');
    }
  }

  const opportunities = await Opportunity.find({ founderEmail }).select('_id company status').lean();
  const opportunityIds = opportunities.map((o) => o._id);

  console.log(
    `Opportunities (${opportunities.length}):`,
    opportunities.map((o) => `${o.company} [${o.status}]`).join(', ') || '(none)'
  );

  const threadIds = (
    await MessageThread.find({
      $or: [{ founderEmail }, ...(opportunityIds.length ? [{ opportunityId: { $in: opportunityIds } }] : [])],
    })
      .select('_id')
      .lean()
  ).map((t) => t._id);

  const counts = {
    opportunities: opportunities.length,
    shortlists: await Shortlist.countDocuments({ founderEmail }),
    matchRecords: opportunityIds.length
      ? await MatchRecord.countDocuments({ opportunityId: { $in: opportunityIds } })
      : 0,
    introRequests: await IntroRequest.countDocuments({ founderEmail }),
    messageThreads: threadIds.length,
    messages: threadIds.length
      ? await Message.countDocuments({ threadId: { $in: threadIds } })
      : 0,
    callSchedules: opportunityIds.length
      ? await CallSchedule.countDocuments({ opportunityId: { $in: opportunityIds } })
      : 0,
    notifications: await Notification.countDocuments({
      recipientType: 'founder',
      recipientEmail: founderEmail,
    }),
  };

  console.log('\nDocuments to remove:');
  console.table(counts);

  if (dryRun) {
    await mongoose.disconnect();
    return;
  }

  const deleted = {
    messages: threadIds.length
      ? (await Message.deleteMany({ threadId: { $in: threadIds } })).deletedCount
      : 0,
    messageThreads: (
      await MessageThread.deleteMany({
        $or: [{ founderEmail }, ...(opportunityIds.length ? [{ opportunityId: { $in: opportunityIds } }] : [])],
      })
    ).deletedCount,
    callSchedules: opportunityIds.length
      ? (await CallSchedule.deleteMany({ opportunityId: { $in: opportunityIds } })).deletedCount
      : 0,
    introRequests: (await IntroRequest.deleteMany({ founderEmail })).deletedCount,
    matchRecords: opportunityIds.length
      ? (await MatchRecord.deleteMany({ opportunityId: { $in: opportunityIds } })).deletedCount
      : 0,
    shortlists: (await Shortlist.deleteMany({ founderEmail })).deletedCount,
    notifications: (
      await Notification.deleteMany({
        recipientType: 'founder',
        recipientEmail: founderEmail,
      })
    ).deletedCount,
    opportunities: (await Opportunity.deleteMany({ founderEmail })).deletedCount,
  };

  console.log('\nDeleted:');
  console.table(deleted);
  console.log(
    '\nDone. User account unchanged. Founder should see onboarding after clearing browser keys:'
  );
  if (user?._id) {
    console.log(`  localStorage.removeItem('devlabs_founder_onboarded_${user._id}')`);
    console.log(`  localStorage.removeItem('devlabs_founder_logo_${user._id}')`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
