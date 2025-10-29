import type { APIRoute } from 'astro';
import { connectAdminDB, connectDB } from '../../../lib/mongodb.ts';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';
import mongoose from 'mongoose';

export const GET: APIRoute = async ({ request, url }) => {
  try {
  // Connect to admin database (migrated schema lives here)
  await connectAdminDB();

    // Get token from Authorization header or cookies
    const authHeader = request.headers.get('Authorization');
    const cookieHeader = request.headers.get('Cookie');

    let token = extractTokenFromHeader(authHeader);
    if (!token && cookieHeader) {
      token = extractTokenFromCookies(cookieHeader);
    }

    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No authentication token provided'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid authentication token'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get pagination parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const sortBy = url.searchParams.get('sortBy') || 'createdAt';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';

    // Get filter parameters
    const statusFilter = url.searchParams.get('status');
    const trackFilter = url.searchParams.get('track');
    const majorFilter = url.searchParams.get('major');

    // Build filter query
    const filterQuery: any = {};
    if (statusFilter) {
      filterQuery.status = statusFilter;
    }
    if (trackFilter) {
      filterQuery.track = trackFilter;
    }
    if (majorFilter) {
      filterQuery.major = { $regex: new RegExp(majorFilter, 'i') };
    }

  // Only fetch applications where resumeUrl exists and is not null
  filterQuery.resumeUrl = { $exists: true, $ne: null };

    console.log('Filter Query:', filterQuery);

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sortObj: any = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    console.log('pulling from db', mongoose.connection.name);

  // Ensure Application model (admin DB) is initialized
  const { Application: ApplicationModel }: any = await import('../../../lib/mongodb.ts');

    // Get total count for pagination
    const total = await ApplicationModel.countDocuments(filterQuery);

    // Fetch applications with pagination
    const applications = await ApplicationModel.find(filterQuery)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // Minimal Application type for this handler
    type ApplicationDoc = {
      _id: any;
      user?: any;
      status?: string;
      major?: string;
      track?: string;
      teamName?: any;
      teamPreference?: string;
      tShirtSize?: string;
      dietaryRestrictions?: string;
      whyJoin?: string;
      resumeUrl?: string;
      metadata?: any;
      createdAt?: Date;
    };

    // Fetch corresponding users for each application (normalize to string IDs and dedupe)
    const userIds: (string | null)[] = (applications as ApplicationDoc[])
      .map((app: ApplicationDoc) => (app.user ? app.user.toString() : null))
      .filter((id: string | null): id is string => Boolean(id));

    const uniqueUserIds = [...new Set(userIds)];

    // Switch to the primary DB to fetch Users (Applications were fetched from admin DB already)
    let users: any[] = [];
    if (uniqueUserIds.length > 0) {
      await connectDB();
      const UserModel: any = (await import('../../../models/user.tsx')).default;
      users = await UserModel.find({ _id: { $in: uniqueUserIds } }).lean();
    }

    // Create a map for quick lookup
    const userMap = new Map<string, any>();
    users.forEach(user => {
      userMap.set(user._id.toString(), user);
    });

    // Combine ALL fields from both Application and User models into comprehensive item objects
    const applicationsWithUsers = (applications as ApplicationDoc[]).map((app: ApplicationDoc) => {
      const userIdStr = app.user ? app.user.toString() : null;
      const user = userIdStr ? userMap.get(userIdStr) : null;

      // Create a comprehensive item with all Application fields + all User fields
      return {
        // Application fields (from new schema)
        _id: app._id,
        applicationId: app._id, // Alias for clarity
        user: app.user, // Keep the user ObjectId reference
        status: app.status,
        major: app.major,
        track: app.track,
        teamName: app.teamName,
        teamPreference: app.teamPreference,
        tShirtSize: app.tShirtSize,
        dietaryRestrictions: app.dietaryRestrictions,
        whyJoin: app.whyJoin,
        resumeUrl: app.resumeUrl || user?.resumeUrl, // Prefer Application resumeUrl, fallback to User
        metadata: app.metadata,
        createdAt: app.createdAt,

        // User fields (complete profile data)
        userId: user?._id?.toString() || null,
        name: user?.profile?.name || 'N/A',
        email: user?.profile?.email || 'N/A',
        emailLower: user?.profile?.emailLower || null,

        // Extended user profile fields
        gender: user?.profile?.gender || null,
        dob: user?.profile?.dob || null,
        phone: user?.profile?.phone || null,
        country: user?.profile?.country || null,
        twitterHandle: user?.profile?.twitterHandle || null,
        linkedin: user?.profile?.linkedin || null,
        personalWebsite: user?.profile?.personalWebsite || null,
        portfolio: user?.profile?.portfolio || null,
        github: user?.profile?.github || null,
        proofOfWork: user?.profile?.proofOfWork || null,
        additionalInfo: user?.profile?.additionalInfo || null,
        favoriteLink: user?.profile?.favoriteLink || null,
        coolestThing: user?.profile?.coolestThing || null,
        projectIdea: user?.profile?.projectIdea || null,
        referralSource: user?.profile?.referralSource || null,

        // User metadata
        role: user?.role || null,
        oauthProvider: user?.oauthProvider || null,
        userCreatedAt: user?.createdAt || null,
        userUpdatedAt: user?.updatedAt || null,

        // Full user object for ProfileModal
        userObject: user ? {
          _id: user._id,
          profile: user.profile,
          role: user.role,
          resumeUrl: user.resumeUrl,
          oauthProvider: user.oauthProvider,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        } : null,
      };
    });

    // Calculate pagination metadata

    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;


    return new Response(
      JSON.stringify({
        success: true,
        applications: applicationsWithUsers,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasMore,
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Get applications error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
