export type ChatTurn = { role: string; content: string };

const AFFIRMATIVE = /^(yes|yep|yeah|sure|ok(?:ay)?|sounds good|looks good|perfect|do it|save it|update it|go ahead|that works|please update|update my bio|update my profile)\.?$/i;

export function isAffirmativeConfirmation(text: string) {
  return AFFIRMATIVE.test(text.trim());
}

export function wantsBioUpdate(text: string) {
  const lower = text.toLowerCase();
  return (
    /update my bio|save (this|that|it)|use (this|that)|apply (this|that)/i.test(lower) ||
    (isAffirmativeConfirmation(text) && lower.length < 40)
  );
}

/** Pull the longest plausible bio paragraph from recent assistant turns. */
export function extractBioDraftFromHistory(history: ChatTurn[]): string | null {
  const assistantTurns = history
    .filter((t) => t.role === 'assistant' || t.role === 'agent')
    .map((t) => t.content.trim())
    .reverse();

  for (const content of assistantTurns) {
    const quoted = content.match(/"([^"]{40,})"/)?.[1];
    if (quoted && quoted.split(/\s+/).length >= 12) return quoted.trim();

    const paragraphs = content
      .split(/\n\n+/)
      .map((p) => p.replace(/^[-*•]\s*/, '').trim())
      .filter((p) => p.length >= 80 && !/^#{1,3}\s/.test(p));

    for (const p of paragraphs) {
      if (/full-stack|developer|engineer|passionate|proven ability/i.test(p)) {
        return p.replace(/^Bio:\s*/i, '').trim();
      }
    }

    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (
        line.length >= 80 &&
        /developer|engineer|full-stack|building|projects like/i.test(line) &&
        !/^(here|okay|great|i've|your profile|does this)/i.test(line)
      ) {
        return line.replace(/^Bio:\s*/i, '').trim();
      }
    }
  }
  return null;
}

export function extractHeadlineFromText(text: string): string | null {
  const match = text.match(/(?:headline|title)\s*[:]\s*(.+)/i);
  if (match?.[1]) return match[1].trim().slice(0, 120);
  return null;
}

export function extractBioFromUserText(text: string): string | null {
  const labeled = text.match(/(?:bio|summary)\s*[:]\s*([\s\S]+)/i)?.[1];
  if (labeled && labeled.trim().length >= 20) return labeled.trim().slice(0, 2000);
  if (text.length >= 80 && text.split(/\s+/).length >= 12) return text.trim().slice(0, 2000);
  return null;
}

export function agentStorageKey(userId: string) {
  return `devlabs_agent_messages_${userId}`;
}

const DASHBOARD_SYSTEM_MESSAGE =
  /dashboard load timed out|failed to fetch|could not load dashboard|networkerror/i;

/** Strip one-off dashboard/sync failures from persisted agent chat history. */
export function sanitizeAgentMessages(
  messages: Array<{ sender: string; text: string }>
): Array<{ sender: 'agent' | 'user'; text: string }> {
  return messages
    .filter((m) => {
      if (m.sender !== 'agent') return true;
      return !DASHBOARD_SYSTEM_MESSAGE.test(m.text);
    })
    .map((m) => ({
      sender: m.sender === 'user' ? 'user' : 'agent',
      text: m.text,
    }));
}

export function clearAgentStorageForUser(userId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(agentStorageKey(userId));
    localStorage.removeItem('devlabs_agent_messages');
  } catch {
    /* ignore */
  }
}
