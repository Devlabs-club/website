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
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #e5e5e5; 
              background-color: #0a0a0a;
              padding: 20px;
            }
            .container { 
              max-width: 650px; 
              margin: 0 auto; 
              background: linear-gradient(135deg, #171717 0%, #0a0a0a 100%);
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 8px 32px rgba(251, 146, 60, 0.1);
            }
            .header { 
              background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
              color: white; 
              padding: 40px 30px;
              text-align: center;
              position: relative;
            }
            .logo-container {
              margin-bottom: 20px;
            }
            .logo {
              width: 60px;
              height: 60px;
              filter: brightness(0) invert(1);
            }
            .header h1 { 
              font-size: 28px;
              font-weight: 700;
              margin: 0;
              letter-spacing: -0.5px;
            }
            .header p {
              margin-top: 8px;
              opacity: 0.95;
              font-size: 15px;
            }
            .content { 
              background-color: #171717;
              padding: 30px;
            }
            .section { 
              margin-bottom: 28px;
              background: #1f1f1f;
              padding: 20px;
              border-radius: 12px;
              border-left: 3px solid #fb923c;
            }
            .section h3 { 
              color: #fb923c;
              font-size: 18px;
              font-weight: 600;
              margin-bottom: 15px;
              letter-spacing: -0.3px;
            }
            ul { 
              list-style: none; 
              padding: 0; 
            }
            li { 
              padding: 8px 0;
              color: #d4d4d4;
              font-size: 14px;
            }
            .label { 
              font-weight: 600;
              color: #fb923c;
              display: inline-block;
              min-width: 140px;
            }
            .section p {
              color: #d4d4d4;
              font-size: 14px;
              line-height: 1.7;
            }
            .section p .label {
              display: block;
              margin-bottom: 6px;
            }
            a {
              color: #fb923c;
              text-decoration: none;
              transition: color 0.2s;
            }
            a:hover {
              color: #fdba74;
            }
            .footer { 
              text-align: center;
              padding: 25px;
              color: #737373;
              font-size: 13px;
              background: #0a0a0a;
              border-top: 1px solid #262626;
            }
            .footer p {
              margin: 4px 0;
            }
            .footer .brand {
              color: #fb923c;
              font-weight: 600;
              font-size: 14px;
              margin-top: 8px;
            }
            .badge {
              display: inline-block;
              padding: 4px 12px;
              background: rgba(251, 146, 60, 0.1);
              color: #fb923c;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              margin: 2px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo-container">
                <svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="white">
                  <circle cx="100" cy="100" r="80" fill="white"/>
                </svg>
              </div>
              <h1>🎉 New Client Submission!</h1>
              <p>A new company is looking to hire through DevLabs</p>
            </div>
            <div class="content">
              <div class="section">
                <h3>🏢 Company Information</h3>
                <ul>
                  <li><span class="label">Company Name:</span> ${clientData.companyName}</li>
                  <li><span class="label">Website:</span> ${clientData.companyWebsite ? `<a href="${clientData.companyWebsite}" target="_blank">${clientData.companyWebsite}</a>` : '<span style="color: #737373;">Not provided</span>'}</li>
                </ul>
              </div>
              
              <div class="section">
                <h3>👤 Contact Information</h3>
                <ul>
                  <li><span class="label">Contact Name:</span> ${clientData.contactName}</li>
                  <li><span class="label">Email:</span> <a href="mailto:${clientData.email}">${clientData.email}</a></li>
                  <li><span class="label">Phone:</span> ${clientData.phone}</li>
                </ul>
              </div>
              
              <div class="section">
                <h3>💼 Role Details</h3>
                <ul>
                  <li><span class="label">Role Title:</span> ${clientData.roleTitle}</li>
                  <li>
                    <span class="label">Role Type:</span><br>
                    ${clientData.roleType.map((type: string) => `<span class="badge">${type}</span>`).join(' ')}
                  </li>
                  <li>
                    <span class="label">Work Mode:</span><br>
                    ${clientData.workMode.map((mode: string) => `<span class="badge">${mode}</span>`).join(' ')}
                  </li>
                  <li><span class="label">Compensation:</span> ${clientData.compensation}</li>
                  <li><span class="label">Visa Sponsorship:</span> ${clientData.sponsorVisa}</li>
                </ul>
              </div>
              
              <div class="section">
                <h3>🎯 Requirements</h3>
                <p><span class="label">Skills:</span> ${clientData.skills}</p>
                <p style="margin-top: 12px;"><span class="label">Mindset:</span> ${clientData.mindset}</p>
              </div>
              
              <div class="section">
                <h3>📝 Role Description</h3>
                <p>${clientData.roleDescription.replace(/\n/g, '<br>')}</p>
              </div>
              
              ${clientData.additionalNotes ? `
              <div class="section">
                <h3>📌 Additional Notes</h3>
                <p>${clientData.additionalNotes.replace(/\n/g, '<br>')}</p>
              </div>
              ` : ""}
            </div>
            <div class="footer">
              <p>Submitted on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
              <p class="brand">DevLabs Talent Network</p>
              <p style="margin-top: 12px; font-size: 12px;">Connecting exceptional builders with innovative companies</p>
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