import type { APIRoute } from 'astro';
import { connectAdminDB, connectDB, Application } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
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

    console.log('Filter Query:', filterQuery);

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sortObj: any = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    console.log('pulling from db', mongoose.connection.name);

    // Get total count for pagination
    const total = await Application.countDocuments(filterQuery);

    // Fetch applications with pagination
    const applications = await Application.find(filterQuery)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    console.log('First application fetched:', applications[0]);

    // Fetch corresponding users for each application
    const userIds = applications
      .map(app => app.user)
      .filter(Boolean); // Filter out null/undefined user references

    // Fetch all users at once for efficiency - get full user data
    const users = await User.find({ _id: { $in: userIds } })
      .lean();

    // Create a map for quick lookup
    const userMap = new Map();
    users.forEach(user => {
      userMap.set(user._id.toString(), user);
    });

    // Populate name and email from User objects (no fallback to legacy app fields), and attach user _id
    const applicationsWithUsers = applications.map(app => {
      const user = app.user ? userMap.get(app.user.toString()) : null;
      return {
        ...app,
        name: user?.profile?.name || 'N/A',
        email: user?.profile?.email || 'N/A',
        // Explicitly include resumeUrl to ensure it's not lost
        resumeUrl: app.resumeUrl,
        // Preserve the raw user ObjectId even if user lookup failed
        // This allows fetching user data later for resume display
        user: user ? { _id: user._id, ...user } : (app.user ? app.user.toString() : null),
      };
    });

    // Calculate pagination metadata

    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Log the first sample profile to the console for inspection
    if (applicationsWithUsers.length > 0) {
      console.log('Sample applicationWithUsers[0]:', JSON.stringify(applicationsWithUsers[0], null, 2));
    }

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
