import type { APIRoute } from "astro";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import { v2 as cloudinary } from "cloudinary";
import User from "../../../models/user"; 


cloudinary.config({
  cloud_name: import.meta.env.CLOUDINARY_CLOUD_NAME,
  api_key: import.meta.env.CLOUDINARY_API_KEY,
  api_secret: import.meta.env.CLOUDINARY_API_SECRET,
});



const expoUserSchema = new mongoose.Schema({
  name: String,
  age: Number,
  email: String,
  phone: String,
  university: String,
  major: String,
  yearOfStudy: String,
  expectedGradYear: Number,
  linkedin: String,
  website: String,
  workEligibility: String,
  needSponsorship: String,
  sponsorshipType: String,
  resumeUrl: String,
  pitchVideoUrl: String,
  createdAt: { type: Date, default: Date.now },
});

const ExpoUser =
  mongoose.models.ExpoUser || mongoose.model("ExpoUser", expoUserSchema);



async function uploadToCloudinary(fileBase64: string, folder: string) {
  const res = await cloudinary.uploader.upload(fileBase64, {
    folder,
    resource_type: "auto",
  });
  return res.secure_url;
}



export const POST: APIRoute = async ({ request }) => {
  try {
    await connectDB();

    const data = await request.json();
    const { email, resumeFile, pitchVideoFile, ...rest } = data;

  
    let resumeUrl = rest.resumeUrl || "";
    let pitchVideoUrl = rest.pitchVideoUrl || "";

    if (resumeFile) {
      resumeUrl = await uploadToCloudinary(resumeFile, "expo/resumes");
    }

    if (pitchVideoFile) {
      pitchVideoUrl = await uploadToCloudinary(pitchVideoFile, "expo/videos");
    }


    const expoUser = await ExpoUser.create({
      ...rest,
      email,
      resumeUrl,
      pitchVideoUrl,
    });

    const existingUser = await User.findOne({ email });

    if (!existingUser) {
      await User.create({
        email,
        profile: { name: rest.name, university: rest.university },
        resumeUrl,
      });
    }

    const Application =
      mongoose.models.Application ||
      mongoose.model(
        "Application",
        new mongoose.Schema({
          email: String,
          university: String,
          major: String,
          resumeUrl: String,
          createdAt: { type: Date, default: Date.now },
        })
      );

    const existingApp = await Application.findOne({ email });
    if (!existingApp) {
      await Application.create({
        email,
        university: rest.university,
        major: rest.major,
        resumeUrl,
      });
    }

    return new Response(
      JSON.stringify({ success: true, id: expoUser._id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Expo save error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
