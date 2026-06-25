import { connectDB } from '@/lib/mongodb';
import ImessageConversation from '@/models/talent/ImessageConversation';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { runBuilderAgentTurn } from '@/lib/agent/runners/builderAgentRunner';
import { resolveBuilderByHandle, attachHandleToBuilder } from './builderResolver';
import type { MessageProvider, NormalizedInbound } from './types';

const MAX_HISTORY = 20;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Flatten agent uiBlocks (option/confirmation cards) into plain iMessage text. */
function flattenReply(message: string, uiBlocks: any[]): string {
  let out = (message || '').trim();
  for (const block of uiBlocks || []) {
    if (block?.type === 'options' && Array.isArray(block.options)) {
      const lines = block.options
        .map((o: any, i: number) => `${i + 1}. ${o.label ?? o.value ?? o}`)
        .join('\n');
      out += `\n\n${block.question ? block.question + '\n' : ''}${lines}\n(reply with a number)`;
    } else if (block?.type === 'confirmation') {
      out += `\n\n${block.title ?? ''}${block.preview ? `\n${block.preview}` : ''}\nReply "yes" to confirm or "no" to change.`;
    }
  }
  return out.trim();
}

/**
 * Core inbound handler. Transport-agnostic: receives a NormalizedInbound and a
 * provider to reply through. Idempotent on providerMessageGuid.
 */
export async function handleInbound(inbound: NormalizedInbound, provider: MessageProvider): Promise<void> {
  await connectDB();

  const convo = await ImessageConversation.findOneAndUpdate(
    { handle: inbound.handle },
    {
      $setOnInsert: { handle: inbound.handle, claimState: 'unresolved' },
      $set: { chatGuid: inbound.chatGuid, service: inbound.service, lastInboundAt: inbound.receivedAt },
    },
    { upsert: true, new: true }
  );

  // Idempotency: skip already-processed deliveries.
  if (convo.processedGuids?.includes(inbound.providerMessageGuid)) return;
  convo.processedGuids = [...(convo.processedGuids || []), inbound.providerMessageGuid].slice(-50);

  const replyTo = { handle: inbound.handle, chatGuid: convo.chatGuid };

  // Opt-out.
  if (/^\s*(stop|unsubscribe|opt out|opt-out)\s*$/i.test(inbound.text)) {
    convo.claimState = 'opted_out';
    if (convo.builderId) await BuilderProfile.updateOne({ _id: convo.builderId }, { $set: { visibilityStatus: 'hidden' } });
    await convo.save();
    await provider.send(replyTo, "Got it — you won't hear from me again. Text me anytime if you change your mind.");
    return;
  }

  // Resolve builder if not yet linked.
  if (!convo.builderId) {
    let res = await resolveBuilderByHandle(inbound.handle);
    if (res.status === 'none') {
      const emailInText = inbound.text.match(EMAIL_RE)?.[0];
      if (emailInText) {
        res = await resolveBuilderByHandle(emailInText);
        if (res.status === 'matched') await attachHandleToBuilder(String(res.builder._id), inbound.handle);
      }
    }

    if (res.status === 'matched') {
      convo.builderId = res.builder._id;
      convo.claimState = 'resolved';
    } else if (res.status === 'ambiguous') {
      convo.messages.push({ role: 'user', content: inbound.text, providerMessageGuid: inbound.providerMessageGuid, at: new Date() });
      await convo.save();
      const reply = "I found a few profiles — which email did you get our note on?";
      await provider.send(replyTo, reply);
      convo.messages.push({ role: 'assistant', content: reply, at: new Date() });
      await convo.save();
      return;
    } else {
      convo.messages.push({ role: 'user', content: inbound.text, providerMessageGuid: inbound.providerMessageGuid, at: new Date() });
      const reply =
        "Hey! I'm the DevLabs profile agent 👋 I don't have a profile linked to this number yet — what's the email you got our note on? (or send your LinkedIn/GitHub and I'll build it)";
      await provider.send(replyTo, reply);
      convo.messages.push({ role: 'assistant', content: reply, at: new Date() });
      convo.lastOutboundAt = new Date();
      await convo.save();
      return;
    }
  }

  // Run the Builder Agent with rolling history.
  convo.messages.push({ role: 'user', content: inbound.text, providerMessageGuid: inbound.providerMessageGuid, at: new Date() });
  const builder = await BuilderProfile.findById(convo.builderId).lean();
  const history = convo.messages.slice(-MAX_HISTORY).map((m: any) => ({ role: m.role, content: m.content }));

  if (provider.setTyping) await provider.setTyping(replyTo).catch(() => {});

  let replyText = "I hit a snag — try that again?";
  try {
    const res = await runBuilderAgentTurn({
      builder,
      builderId: String(convo.builderId),
      userText: inbound.text,
      history: history.slice(0, -1), // exclude the just-pushed turn; runner appends userText
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (data?.message) replyText = flattenReply(data.message, data.uiBlocks || []);
  } catch (err) {
    console.error('[imessageGateway] agent turn failed', err);
  }

  await provider.send(replyTo, replyText);
  convo.messages.push({ role: 'assistant', content: replyText, at: new Date() });
  convo.lastOutboundAt = new Date();
  if (convo.claimState === 'resolved') convo.claimState = 'confirming';
  await convo.save();
}
