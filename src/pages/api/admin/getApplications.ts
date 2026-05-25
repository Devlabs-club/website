import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import mongoose from 'mongoose';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Connect to admin database
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

    // Get connection and users collection directly (unified schema)
    const connection = mongoose.connection;
    const usersCollection = connection.db?.collection('users');
    
    if (!usersCollection) {
      throw new Error('Failed to get users collection');
    }

    // Get all users with unified schema (sorted by createdAt descending)
    const users = await usersCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Format users to match expected application structure for backward compatibility
    const formattedUsers = users.map((user: any) => ({
      _id: user._id,
      name: user.fullName || user.name || 'Unknown',
      age: user.age || null,
      email: user.email || '',
      phone: user.phone || null,
      major: user.major || '',
      yearOfStudy: user.yearOfStudy || null,
      expectedGradYear: user.expectedGraduationYear || null,
      linkedin: user.linkedinUrl || null,
      website: user.githubOrPortfolioUrl || null,
      workEligibility: user.eligibleToWorkInUS ? 'Yes' : 'No',
      needSponsorship: user.requiresVisaSponsorship ? 'Yes' : 'No',
      sponsorshipType: user.visaType || null,
      progress: 100, // All migrated users have complete data
      resumeUrl: user.resumeUrl || null,
      createdAt: user.createdAt || new Date(),
      updatedAt: user.updatedAt || new Date(),
      user: {
        _id: user._id,
        name: user.fullName || user.name || 'Unknown',
        email: user.email || ''
      },
      // Include unified schema fields for compatibility
      fullName: user.fullName,
      linkedinUrl: user.linkedinUrl,
      githubOrPortfolioUrl: user.githubOrPortfolioUrl,
      eligibleToWorkInUS: user.eligibleToWorkInUS,
      requiresVisaSponsorship: user.requiresVisaSponsorship,
      visaType: user.visaType,
      season: user.season,
      checkedIn: user.checkedIn,
      // Include flag field
      flag: user.flag || null
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedUsers
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
        message: 'Failed to fetch applications',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

