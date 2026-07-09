import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

function envBoolean(value: string | undefined | null, fallback: boolean) {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

export function isBuilderImessageEnabled(runtime?: RuntimeEnv) {
  return envBoolean(
    readEnv('DEVLABS_IMESSAGE_ENABLED', runtime) ||
      readEnv('BUILDER_IMESSAGE_ENABLED', runtime) ||
      readEnv('IMESSAGE_ENABLED', runtime),
    false
  );
}
