import type { APIRoute } from 'astro';
import { connectDB, Application } from '../../lib/mongodb';
import User from '../../models/user.tsx';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
    try {
        // Try to connect to the database
        await connectDB();

        // Check if Application model is available (will be null during static build)
        if (!Application) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Database connection not available'
            }), {
                status: 503, // Service Unavailable
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        const data = await request.json();
        
        // Get token from Authorization header or cookies
        const authHeader = request.headers.get('Authorization');
        const cookieHeader = request.headers.get('Cookie');
        
        let token = extractTokenFromHeader(authHeader);
        if (!token && cookieHeader) {
            token = extractTokenFromCookies(cookieHeader);
        }

        if (!token) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not authenticated. Please log in.'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Verify token
        const decoded = verifyToken(token);
        if (!decoded) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid or expired token. Please log in again.'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Get user from token
        const user = await User.findById(decoded.userId);
        if (!user) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not found'
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        const userEmail = user.email;

        // Validate required fields for the new schema
        const requiredFields = ['name', 'age', 'phone', 'major', 'yearOfStudy', 'expectedGradYear', 'linkedin', 'workEligibility', 'needSponsorship'];
        const missingFields = requiredFields.filter(field => {
            const value = data[field];
            // Handle numeric fields (age, expectedGradYear)
            if (field === 'age' || field === 'expectedGradYear') {
                return value === undefined || value === null || !Number.isFinite(value);
            }
            // Handle string fields
            return !value || String(value).trim().length === 0;
        });
        
        if (missingFields.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Check if application already exists for this user
        let application = await Application.findOne({ user: user._id });
        console.log(`Checking application for user ${user._id} (${userEmail}):`, application ? 'Found' : 'Not found');

        // Prepare application data with user reference
        const applicationData = {
            user: user._id, // Always ensure user field is set
            name: data.name,
            age: data.age,
            phone: data.phone,
            major: data.major,
            yearOfStudy: data.yearOfStudy,
            expectedGradYear: data.expectedGradYear,
            linkedin: data.linkedin,
            github: data.github || '',
            website: data.website || '',
            workEligibility: data.workEligibility,
            needSponsorship: data.needSponsorship,
            sponsorshipType: data.sponsorshipType || '',
            resumeUrl: data.resumeUrl || ''
        };

        if (application) {
            // Update existing application and ensure user field is set
            console.log(`Updating existing application ${application._id} for user ${user._id}`);
            application = await Application.findOneAndUpdate(
                { user: user._id },
                { $set: applicationData }, // Use $set to ensure user field is updated if missing
                { new: true, runValidators: true }
            );
            console.log(`Application updated successfully, user field:`, application.user);
        } else {
            // Check if there's an orphaned application (without user field or with null user)
            // This handles cases where applications exist but aren't properly linked
            const orphanedApplication = await Application.findOne({
                $or: [
                    { user: { $exists: false } },
                    { user: null }
                ]
            });

            if (orphanedApplication) {
                // Link the orphaned application to this user
                console.log(`Found orphaned application ${orphanedApplication._id}, linking to user ${user._id}`);
                application = await Application.findByIdAndUpdate(
                    orphanedApplication._id,
                    { $set: applicationData },
                    { new: true, runValidators: true }
                );
            } else {
                // Create new application with user reference
                console.log(`Creating new application for user ${user._id}`);
                application = await Application.create(applicationData);
                console.log(`Application created successfully with ID ${application._id}, user field:`, application.user);
            }
        }

        // Verify the application is properly linked to the user
        if (!application.user || application.user.toString() !== user._id.toString()) {
            console.error('Application user field mismatch!', {
                applicationUser: application.user,
                expectedUser: user._id
            });
            // Force update the user field if somehow it's still not set
            application = await Application.findByIdAndUpdate(
                application._id,
                { $set: { user: user._id } },
                { new: true }
            );
        }

        // Update user's major field
        await User.findByIdAndUpdate(user._id, { major: data.major });

        return new Response(JSON.stringify({ success: true, data: application }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error saving application:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to save application';
        return new Response(JSON.stringify({
            success: false,
            error: errorMessage,
            details: error instanceof Error ? error.stack : undefined
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};

export const GET: APIRoute = async ({ request }) => {
    try {
        // Try to connect to the database
        await connectDB();

        // Check if Application model is available (will be null during static build)
        if (!Application) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Database connection not available'
            }), {
                status: 503, // Service Unavailable
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Get token from Authorization header or cookies
        const authHeader = request.headers.get('Authorization');
        const cookieHeader = request.headers.get('Cookie');
        
        let token = extractTokenFromHeader(authHeader);
        if (!token && cookieHeader) {
            token = extractTokenFromCookies(cookieHeader);
        }

        if (!token) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not authenticated. Please log in.'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Verify token
        const decoded = verifyToken(token);
        if (!decoded) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid or expired token. Please log in again.'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Get user from token
        const user = await User.findById(decoded.userId);
        if (!user) {
            return new Response(JSON.stringify({
                success: true,
                data: null
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Find application by user ID
        const application = await Application.findOne({ user: user._id });

        if (!application) {
            return new Response(JSON.stringify({
                success: true,
                data: null
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: application,
            user: user,
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error fetching application:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch application'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}; 