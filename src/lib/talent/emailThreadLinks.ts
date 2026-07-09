/** Gmail search URL to find the email thread with a builder about a role. */
export function gmailThreadSearchUrl(params: {
  threadId?: string | null;
  builderEmail?: string | null;
  builderName?: string | null;
  roleTitle?: string | null;
  founderEmail?: string | null;
  replyDomain?: string | null;
}) {
  const domain = (params.replyDomain || 'reply.devlabs.club').replace(/^@/, '');
  const parts: string[] = [];

  if (params.threadId) {
    parts.push(`to:reply+thread_${params.threadId}@${domain}`);
  }
  if (params.builderEmail) parts.push(`from:${params.builderEmail}`);
  else if (params.builderName) parts.push(`"${params.builderName}"`);
  if (params.founderEmail) parts.push(`to:${params.founderEmail}`);
  if (params.roleTitle) parts.push(`subject:"${params.roleTitle}"`);

  const query = parts.join(' ').trim() || 'DevLabs';
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
}

export function founderConversationUrl(threadId: string) {
  const base = (typeof window !== 'undefined' ? window.location.origin : process.env.WEBSITE_ROOT || 'http://localhost:4321').replace(/\/$/, '');
  return `${base}/founder/conversations?threadId=${encodeURIComponent(threadId)}`;
}
