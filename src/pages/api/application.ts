import type { APIRoute } from 'astro';
import { connectDB, Application } from '../../lib/mongodb';

export const POST: APIRoute = async ({ request }) => {
    try {
        await connectDB();
        const data = await request.json();
        const isFinalSubmission = data.progress === 4; // Check if this is the final submission

        // Check if application exists by email
        let application = await Application.findOne({ email: data.email });

        if (application) {
            // For updates, only validate required fields if it's a final submission
            if (isFinalSubmission) {
                // Validate all required fields for final submission
                const requiredFields = ['name', 'gender', 'age', 'email', 'phone', 'about', 'country', 'projectIdea', 'referralSource'];
                const missingFields = requiredFields.filter(field => !data[field]);
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
            }

            // Update existing application
            application = await Application.findOneAndUpdate(
                { email: data.email },
                { ...data, updatedAt: new Date() },
                { new: true, runValidators: isFinalSubmission } // Only run validators on final submission
            );
        } else {
            // For new applications, only validate required fields if it's a final submission
            if (isFinalSubmission) {
                // Validate all required fields for final submission
                const requiredFields = ['name', 'gender', 'age', 'email', 'phone', 'about', 'country', 'projectIdea', 'referralSource'];
                const missingFields = requiredFields.filter(field => !data[field]);
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
                // Create new application with full validation
                application = await Application.create(data);
            } else {
                // For partial saves, create without validation
                application = await Application.create({ ...data, createdAt: new Date(), updatedAt: new Date() });
            }
        }

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

export const GET: APIRoute = async ({ url }) => {
    try {
        await connectDB();
        const email = url.searchParams.get('email');

        if (!email) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Email parameter is required'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        const application = await Application.findOne({ email });

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
            data: application
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