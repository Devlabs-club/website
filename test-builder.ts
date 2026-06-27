import mongoose from 'mongoose';
import { connectDB } from './src/lib/mongodb';
import BuilderProfile from './src/models/talent/BuilderProfile';
import ProjectRecord from './src/models/talent/ProjectRecord';
import { evaluateBuilderProfileQuality } from './src/lib/talent/profileQuality';

async function run() {
  await connectDB();
  
  const builder = await BuilderProfile.findOne({ email: /dkalaise/i });
  if (!builder) {
    console.log('Builder not found by email');
    process.exit(1);
  }
  
  console.log('Builder ID:', builder._id);
  
  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  
  const quality = await evaluateBuilderProfileQuality(builder, projects, [], []);
  console.log('--- Computed Quality ---');
  console.log(quality);
  
  builder.profileQuality = quality;
  builder.profileQuality.evaluatedAt = new Date();
  await builder.save();
  console.log('Saved quality to DB');
  
  process.exit(0);
}

run().catch(console.error);
