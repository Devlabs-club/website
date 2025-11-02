import type { APIRoute } from "astro";
import * as z from "zod";
import mongoose from "mongoose";
import { connectDB } from "../../lib/mongodb";
import nodemailer from "nodemailer";

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


async function sendNotificationEmail(clientData: any) {
  try {
    const zohoEmail = process.env.ZOHO_EMAIL;
    const zohoPassword = process.env.ZOHO_PASSWORD;

    if (!zohoEmail || !zohoPassword) {
      console.error("Missing ZOHO_EMAIL or ZOHO_PASSWORD in environment variables");
      return false;
    }

    
    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.com",
      port: 587,
      secure: false,
      auth: {
        user: zohoEmail,
        pass: zohoPassword,
      },
    });

    const mailOptions = {
      from: zohoEmail,
      to: zohoEmail,
      subject: `New Client Submission: ${clientData.companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
            .section { margin-bottom: 20px; }
            .section h3 { color: #4CAF50; border-bottom: 2px solid #4CAF50; padding-bottom: 5px; }
            ul { list-style: none; padding: 0; }
            li { padding: 5px 0; }
            .label { font-weight: bold; color: #555; }
            .footer { text-align: center; padding: 15px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Client Submission!</h1>
            </div>
            <div class="content">
              <div class="section">
                <h3>Company Information</h3>
                <ul>
                  <li><span class="label">Company Name:</span> ${clientData.companyName}</li>
                  <li><span class="label">Website:</span> ${clientData.companyWebsite || "Not provided"}</li>
                </ul>
              </div>
              
              <div class="section">
                <h3>Contact Information</h3>
                <ul>
                  <li><span class="label">Contact Name:</span> ${clientData.contactName}</li>
                  <li><span class="label">Email:</span> <a href="mailto:${clientData.email}">${clientData.email}</a></li>
                  <li><span class="label">Phone:</span> ${clientData.phone}</li>
                </ul>
              </div>
              
              <div class="section">
                <h3>Role Details</h3>
                <ul>
                  <li><span class="label">Role Title:</span> ${clientData.roleTitle}</li>
                  <li><span class="label">Role Type:</span> ${clientData.roleType.join(", ")}</li>
                  <li><span class="label">Work Mode:</span> ${clientData.workMode.join(", ")}</li>
                  <li><span class="label">Compensation:</span> ${clientData.compensation}</li>
                  <li><span class="label">Visa Sponsorship:</span> ${clientData.sponsorVisa}</li>
                </ul>
              </div>
              
              <div class="section">
                <h3>Requirements</h3>
                <p><span class="label">Skills:</span> ${clientData.skills}</p>
                <p><span class="label">Mindset:</span> ${clientData.mindset}</p>
              </div>
              
              <div class="section">
                <h3>Role Description</h3>
                <p>${clientData.roleDescription}</p>
              </div>
              
              ${clientData.additionalNotes ? `
              <div class="section">
                <h3>Additional Notes</h3>
                <p>${clientData.additionalNotes}</p>
              </div>
              ` : ""}
            </div>
            <div class="footer">
              <p>Submitted on: ${new Date().toLocaleString()}</p>
              <p>DevLabs Client Management System</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Notification email sent successfully to", zohoEmail);
    return true;
  } catch (error) {
    console.error("Failed to send notification email:", error);
    return false;
  }
}

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
    console.log("Client saved to database:", result._id);

    
    await sendNotificationEmail(doc);

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
  const Client = db.model?.("Client") || db.model("Client", clientSchema);

  const rows = await Client.find({}, "companyName email roleTitle createdAt")
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return new Response(JSON.stringify({ ok: true, rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};