/**
 * SendGrid Inbound Parse posts to /email/sendgrid-inbound (no /api prefix).
 * Re-export the API handler so production + ngrok configs match without rewrites.
 */
export { POST } from '../api/email/sendgrid-inbound';

export const prerender = false;
