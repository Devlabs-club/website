import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { hasAgentPhoneConfig } from './agentPhoneClient';
import { hasBlueBubblesConfig } from './bluebubblesClient';
import { agentPhoneProvider } from './providers/agentphone';
import { bluebubblesProvider } from './providers/bluebubbles';
import type { MessageProvider } from './types';

export type ImessageProviderName = 'agentphone' | 'bluebubbles';

/** Which iMessage/SMS transport is active. Defaults to bluebubbles when configured. */
export function getImessageProviderName(runtime?: RuntimeEnv): ImessageProviderName {
  const explicit = readEnv('IMESSAGE_PROVIDER', runtime)?.toLowerCase();
  if (explicit === 'bluebubbles' || explicit === 'agentphone') return explicit;
  if (hasBlueBubblesConfig(runtime)) return 'bluebubbles';
  return 'agentphone';
}

export function getImessageProvider(runtime?: RuntimeEnv): MessageProvider {
  return getImessageProviderName(runtime) === 'bluebubbles' ? bluebubblesProvider : agentPhoneProvider;
}

export function hasImessageConfig(runtime?: RuntimeEnv): boolean {
  const name = getImessageProviderName(runtime);
  return name === 'bluebubbles' ? hasBlueBubblesConfig(runtime) : hasAgentPhoneConfig(runtime);
}
