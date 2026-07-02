function decodeBase64Url(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64url').toString('utf8');
}

export function decodeUploadToken(token) {
  try {
    const [, payload] = String(token).split('.');
    if (!payload) return null;
    const decoded = JSON.parse(decodeBase64Url(payload));
    return decoded.kind === 'agent_wrapped_upload' ? decoded : null;
  } catch {
    return null;
  }
}
