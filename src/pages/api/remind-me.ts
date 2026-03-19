import type { APIRoute } from "astro";
import { connectDB, MomentumReminder } from "@/lib/mongodb";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const rawEmail = (data?.email ?? "") as string;
    const email = rawEmail.trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ message: "Please enter a valid email address." }),
        { status: 400 },
      );
    }

    await connectDB();

    await MomentumReminder.updateOne(
      { email },
      {
        email,
        tag: "momentum-2026-reminder",
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    return new Response(
      JSON.stringify({
        message: "You're on the reminder list for March 17.",
      }),
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error in /api/remind-me:", error);
    return new Response(
      JSON.stringify({
        message: "Something went wrong. Please try again.",
      }),
      { status: 500 },
    );
  }
};
