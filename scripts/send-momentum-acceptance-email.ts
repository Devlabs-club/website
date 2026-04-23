/**
 * Sends the Momentum acceptance email via SendGrid (same template as the app).
 *
 * Usage:
 *   bun run scripts/send-momentum-acceptance-email.ts
 *   bun run scripts/send-momentum-acceptance-email.ts other@email.com "FirstName"
 *
 * Requires SENDGRID_API_KEY (and optionally SENDGRID_FROM_EMAIL) in .env
 */
import "dotenv/config";
import { sendApplicationApprovedEmail } from "../src/lib/momentumEmail";

const DEFAULT_TO = "dkalaise@asu.edu";
const DEFAULT_FIRST_NAME = "Dhanush";

const to = process.argv[2]?.trim() || DEFAULT_TO;
const firstName = process.argv[3]?.trim() || DEFAULT_FIRST_NAME;

if (!process.env.SENDGRID_API_KEY) {
  console.error("Set SENDGRID_API_KEY in your environment or .env file.");
  process.exit(1);
}

await sendApplicationApprovedEmail(to, firstName);
console.log(`Sent acceptance email to ${to} (${firstName})`);
