import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
import { generateToken, isValidPassword } from '../../../lib/auth.ts';
import { buildAuthTokenCookie } from '../../../lib/authCookie.ts';
import { notifyOps, opsPersonFrom } from '../../../lib/opsTelegram';
import { evaluateSignupEmail } from '../../../lib/signupEmailDeliverability.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
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

    // Format + disposable/throwaway domains + MX. Login stays format-only so
    // existing accounts can still sign in.
    const signupEmail = await evaluateSignupEmail(email);
    if (!signupEmail.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          message: signupEmail.message,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const normalizedEmail = signupEmail.email;

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

    await connectAdminDB();

    // Check if user already exists
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
      email: normalizedEmail,
      password,
      role: role === 'founder' ? 'founder' : 'user'
    });

    await newUser.save();

    // Role is often still unset here ("user"); the real "signed up as builder/founder"
    // alert fires from /api/auth/role after they pick an account type.
    notifyOps({
      event: 'account_created',
      title: `New account created ${opsPersonFrom(newUser.name, newUser.email)}${
        newUser.role === 'founder' ? ' (founder)' : ''
      }`,
    });

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
          role: newUser.role,
          accountType: newUser.accountType ?? null,
          onboardingStatus: newUser.onboardingStatus ?? null,
          avatarUrl: newUser.avatarUrl ?? null,
        },
        token
      }),
      {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': buildAuthTokenCookie(token)
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
