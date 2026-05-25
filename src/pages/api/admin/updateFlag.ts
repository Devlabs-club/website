import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import mongoose from 'mongoose';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';

export const POST: APIRoute = async ({ request }) => {
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

    // Parse request body
    const body = await request.json();
    const { userId, flag } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'User ID is required' 
        }),
        { 
          status: 400,
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

    // Update user with flag information
    // If flag is null or undefined, remove the flag field
    const updateData: any = {};
    if (flag === null || flag === undefined) {
      updateData.$unset = { flag: '' };
    } else {
      updateData.$set = { flag };
    }

    const result = await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      updateData
    );

    if (result.matchedCount === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'User not found' 
        }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Flag updated successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Update flag error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Failed to update flag',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

