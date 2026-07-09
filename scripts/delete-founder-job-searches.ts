/**
 * Delete founder job postings and related search artifacts.
 *   npx tsx scripts/delete-founder-job-searches.ts dkalaise@asu.edu
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import JobPosting from '../src/models/founder/JobPosting';
import Shortlist from '../src/models/talent/Shortlist';
import MatchRecord from '../src/models/talent/MatchRecord';
import IntroRequest from '../src/models/talent/IntroRequest';
import MessageThread from '../src/models/talent/MessageThread';
import Message from '../src/models/talent/Message';
import CallSchedule from '../src/models/talent/CallSchedule';
import CandidateFeedback from '../src/models/talent/CandidateFeedback';

async function main() {
  const founderEmail = (process.argv[2] || 'dkalaise@asu.edu').toLowerCase().trim();
  if (!founderEmail) throw new Error('Founder email required');

  await connectAdminDB();
  const jobs = await JobPosting.find({ founderEmail }).select('_id roleTitle title status').lean();
  const jobIds = jobs.map((j) => j._id);

  console.log(`Found ${jobs.length} job(s) for ${founderEmail}:`);
  for (const job of jobs) {
    console.log(`  - ${job._id} | ${job.roleTitle || job.title} | ${job.status}`);
  }
  if (!jobIds.length) {
    console.log('Nothing to delete.');
    return;
  }

  const oppFilter = { opportunityId: { $in: jobIds } };
  const threadIds = (
    await MessageThread.find(oppFilter).select('_id').lean()
  ).map((t) => t._id);

  const results = {
    jobs: (await JobPosting.deleteMany({ founderEmail })).deletedCount,
    shortlists: (await Shortlist.deleteMany({ founderEmail })).deletedCount,
    matchRecords: (await MatchRecord.deleteMany(oppFilter)).deletedCount,
    introRequests: (await IntroRequest.deleteMany(oppFilter)).deletedCount,
    messageThreads: (await MessageThread.deleteMany(oppFilter)).deletedCount,
    messages: threadIds.length
      ? (await Message.deleteMany({ threadId: { $in: threadIds } })).deletedCount
      : 0,
    callSchedules: (await CallSchedule.deleteMany(oppFilter)).deletedCount,
    candidateFeedback: (await CandidateFeedback.deleteMany(oppFilter)).deletedCount,
  };

  console.log('Deleted:', results);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
