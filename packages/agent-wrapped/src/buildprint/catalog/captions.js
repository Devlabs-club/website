import { getIdentityById } from './identities.js';

/** Primary-identity card lines for MVP. Combination matrix deferred. */
export function cardLineForIdentity(identityId) {
  return getIdentityById(identityId)?.cardLine || 'I build with real sessions as proof.';
}

export function linkedInCaption({ identityLabel, substantialSessions, projectCount, proofLines, url }) {
  const proofs = (proofLines || []).slice(0, 3).map((line) => `${line}`).join('\n');
  return [
    `My DevLabs Buildprint recognized me as a ${identityLabel}.`,
    '',
    `It analyzed ${substantialSessions} of my building sessions${projectCount ? ` across ${projectCount} projects` : ''}—not my résumé.`,
    '',
    proofs,
    '',
    `See how I build: ${url}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export function xCaption({ identityLabel, substantialSessions, cardLine, url }) {
  return [
    `${substantialSessions} building sessions analyzed.`,
    '',
    `My DevLabs Buildprint: ${identityLabel}.`,
    '',
    cardLine,
    '',
    url,
  ].join('\n');
}
