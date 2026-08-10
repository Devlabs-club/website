import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import mongoose from 'mongoose';
import { requireAdmin } from '../../../lib/events/adminAuth';

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    // Connect to admin database
    await connectAdminDB();

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
