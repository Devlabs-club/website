import type { APIRoute } from "astro";
import * as z from "zod";
import mongoose from "mongoose";
import { connectDB } from "../../lib/mongodb"; 

const normalizeUrl = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : `https://${s}`;
};


const schema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  companyWebsite: z
    .string()
    .optional()
    .transform((v) => (v ? normalizeUrl(v) : ""))
    .refine(
      (url) => url === "" || /^https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}/.test(url),
      { message: "Enter a valid URL or leave blank" }
    ),
  contactName: z.string().min(2, "Contact name is required"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  email: z.string().email("Please enter a valid email"),
  roleTitle: z.string().min(2, "Role title is required"),
  roleType: z
    .array(
      z.enum([
        "Internship (Paid)",
        "Internship (Unpaid)",
        "Part-time Role",
        "Full-time Role",
        "Contract/Freelance",
      ])
    )
    .min(1, "Select at least one role type"),
  workMode: z
    .array(z.enum(["Remote", "Hybrid", "On-Site"]))
    .min(1, "Select at least one work mode"),
  roleDescription: z.string().min(10, "Please include role details or link"),
  compensation: z.string().optional().default("NIL"),
  skills: z.string().min(2, "Please list key skills"),
  mindset: z.string().min(2, "Please list preferred qualities"),
  sponsorVisa: z.enum(["Yes", "No"]).optional().default("Not specified"),
  additionalNotes: z.string().optional(),
});


const clientSchema = new mongoose.Schema({
  companyName: String,
  companyWebsite: String,
  contactName: String,
  phone: String,
  email: String,
  roleTitle: String,
  roleType: [String],
  workMode: [String],
  roleDescription: String,
  compensation: String,
  skills: String,
  mindset: String,
  sponsorVisa: String,
  additionalNotes: String,
  createdAt: { type: Date, default: Date.now },
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    const parsed = schema.parse(payload);

    const doc = {
      ...parsed,
      companyWebsite: parsed.companyWebsite || "",
      compensation: parsed.compensation || "NIL",
      sponsorVisa: parsed.sponsorVisa || "Not specified",
        phone: parsed.phone || "",
        createdAt: new Date(),
    };

    const mongooseConnection = await connectDB();
    const Client =
        mongoose.models.Client || mongoose.model("Client", clientSchema);


    const result = await Client.create(doc);

    return new Response(JSON.stringify({ ok: true, id: result._id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ClientForm submission error:", err);
    const message =
      err?.issues?.map((i: any) => i.message).join(", ") ||
      err?.message ||
      "Invalid request";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () => {
  const db = await connectDB();
  const Client =
    db.model?.("Client") || db.model("Client", clientSchema);

  const rows = await Client.find({}, "companyName email roleTitle createdAt")
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return new Response(JSON.stringify({ ok: true, rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};