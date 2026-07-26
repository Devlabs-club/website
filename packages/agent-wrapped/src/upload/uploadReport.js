import { PACKAGE_VERSION } from '../buildprint/constants.js';

export async function uploadReport({ apiRoot, token, builderId, report }) {
  const res = await fetch(new URL('/api/builder/wrapped/upload', apiRoot), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      builderId,
      report,
      localAnalysisVersion: PACKAGE_VERSION,
      consent: {
        approvedAt: new Date().toISOString(),
        rawContentUploaded: false,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Upload failed: ${data.error || res.statusText}`);
  }
  return data;
}
