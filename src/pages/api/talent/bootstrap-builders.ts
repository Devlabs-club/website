import type { APIRoute } from 'astro';
import { connectDB, Application } from '@/lib/mongodb';
import User from '@/models/user';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { computeProfileCompletion } from '@/lib/talent/matching';

export const POST: APIRoute = async () => {
  try {
    await connectDB();

    const users = await User.find({}).select('_id name email major resumeUrl').lean();
    let upserted = 0;

    for (const user of users) {
      const application = await Application.findOne({ user: user._id }).lean();

      const payload: any = {
        userId: user._id,
        name: user.name,
        email: user.email,
        universityOrCompany: user.major || null,
        links: {
          resume: application?.resumeUrl || user.resumeUrl || null,
          linkedin: application?.linkedin || null,
          github: application?.github || null,
          portfolio: application?.website || null,
          personalWebsite: application?.website || null,
          devpost: null,
        },
        rolePreference: [],
        preferredWorkType: [],
        verificationStatus: 'imported_unverified',
        legacyRefs: [
          { collection: 'users', documentId: String(user._id), fieldPath: 'root' },
          ...(application
            ? [{ collection: 'applications', documentId: String(application._id), fieldPath: 'root' }]
            : []),
        ],
      };

      const completion = computeProfileCompletion(payload);
      payload.profileCompletion = completion;

      await BuilderProfile.findOneAndUpdate({ email: user.email }, { $set: payload }, { upsert: true, new: true });
      upserted += 1;
    }

    return new Response(JSON.stringify({ success: true, upserted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to bootstrap builders' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
