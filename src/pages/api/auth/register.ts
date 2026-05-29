import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
import { generateToken, isValidEmail, isValidPassword } from '../../../lib/auth.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Connect to admin database
    await connectAdminDB();

    const body = await request.json();
    const { name, email, password, role } = body;

    // Validate input
    if (!name || !email || !password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Please provide name, email, and password' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Please provide a valid email address' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate password strength
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: passwordValidation.message 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'User already exists with this email' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Create new user
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      role: role === 'founder' ? 'founder' : 'user'
    });

    await newUser.save();

    // Generate token
    const token = generateToken(newUser);

    // Return success response with token
    return new Response(
      JSON.stringify({
        success: true,
        message: 'User registered successfully',
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role
        },
        token
      }),
      {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': `auth-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`
        }
      }
    );

  } catch (error) {
    console.error('Registration error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
