import type { APIRoute } from 'astro';
import { connectAdminDB, Application } from '../../lib/mongodb';
import { ApplicationInputSchema, DeprecatedFields } from '../../models/application';
import { verifyToken } from '../../lib/auth';

/**
 * POST /api/application
 * Create or update application for the authenticated user
 * 
 * Authentication: Required (JWT token in cookie)
 * Body: ApplicationInput (validated with Zod)
 * Response: { success: boolean; data?: Application; error?: string }
 */
export const POST: APIRoute = async ({ request, cookies }) => {
    try {
    // Connect to admin database (Application model lives here)
    await connectAdminDB();

        // Check if Application model is available
        if (!Application) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Database connection not available'
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Verify authentication
        const token = cookies.get('auth-token')?.value;
        if (!token) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Authentication required'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.userId) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid authentication token'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    // Parse and validate request body
    const data = await request.json();
    const validationResult = ApplicationInputSchema.safeParse(data);

        if (!validationResult.success) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid application data',
                details: validationResult.error.errors
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const input = validationResult.data as any;
        // Ensure dob is a Date
        if (input.dob && typeof input.dob === 'string') {
            input.dob = new Date(input.dob);
        }

        // Server-computed progress (0-4). Not displayed in admin list.
        const isPersonal = Boolean(input.name && input.gender && input.dob && input.email && input.phone && input.country && input.resumeUrl);
        const isCoreLinks = Boolean(input.linkedin && input.github);
        const isStory = Boolean(input.coolestThing && input.hackathonStory);
        const hasExtras = Boolean(input.projectIdea || input.proofOfWork || input.portfolio || input.personalWebsite || input.favoriteLink || input.twitterHandle || input.referralSource || input.additionalInfo);
        const progress = [isPersonal, isCoreLinks, isStory, hasExtras].reduce((acc, v) => acc + (v ? 1 : 0), 0);

        // Upsert application by user ID
        const application = await Application.findOneAndUpdate(
            { user: decoded.userId },
            {
                ...input,
                ...DeprecatedFields,
                user: decoded.userId,
                progress,
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        // Update user's resumeUrl to match application
        try {
            const User: any = (await import('../../models/user.tsx')).default;
            if (User && input.resumeUrl) {
                await User.findByIdAndUpdate(decoded.userId, { resumeUrl: input.resumeUrl });
            }
        } catch (e) {
            console.warn('Failed to sync user.resumeUrl:', e);
        }

        return new Response(JSON.stringify({
            success: true,
            data: application
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error saving application:', error);
        
        // Handle duplicate key error (shouldn't happen with upsert, but just in case)
        if (error instanceof Error && error.message.includes('duplicate key')) {
            return new Response(JSON.stringify({
                success: false,
                error: 'An application already exists for this user'
            }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const errorMessage = error instanceof Error ? error.message : 'Failed to save application';
        return new Response(JSON.stringify({
            success: false,
            error: errorMessage
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

/**
 * GET /api/application
 * Get application for the authenticated user
 * 
 * Authentication: Required (JWT token in cookie)
 * Response: { success: boolean; data?: Application | null; error?: string }
 */
export const GET: APIRoute = async ({ cookies }) => {
    try {
        // Connect to admin database
        await connectAdminDB();

        // Check if Application model is available
        if (!Application) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Database connection not available'
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Verify authentication
        const token = cookies.get('auth-token')?.value;
        if (!token) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Authentication required'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.userId) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid authentication token'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    // Find application by user ID
    const application = await Application.findOne({ user: decoded.userId });

        return new Response(JSON.stringify({
            success: true,
            data: application || null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching application:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch application'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}; 