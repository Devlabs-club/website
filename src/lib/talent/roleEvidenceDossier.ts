/**
 * Evidence-dossier ranking.
 *
 * Replaces skill-bag ranking for roles that carry a RoleEvidencePlan.
 * Candidates are scored by concrete experience/project proof units that hit
 * role anchor concepts, not by whether any project token loosely overlaps the
 * role title (e.g. a web app that mentions "robotics" once).
 */

export type EvidenceUnit = {
  source: 'experience' | 'project' | 'skill';
  label: string;
  text: string;
  isInternship: boolean;
  anchorHits: string[];
  supportingHits: string[];
  noiseHits: string[];
  score: number;
};

export type RoleEvidenceDossier = {
  units: EvidenceUnit[];
  bestUnits: EvidenceUnit[];
  internshipUnits: EvidenceUnit[];
  evidenceFit: number;
  hasRoleProof: boolean;
  hasInternshipProof: boolean;
  whyTheyMatch: string;
};

const HARDWARE_ANCHOR_ATOMS = new Set([
  'hardware',
  'embedded',
  'firmware',
  'robotics',
  'mechatronics',
  'electronics',
  'electrical',
  'circuit',
  'circuits',
  'pcb',
  'fpga',
  'asic',
  'verilog',
  'vhdl',
  'rtl',
  'sensor',
  'sensors',
  'actuator',
  'microcontroller',
  'microprocessor',
  'arduino',
  'raspberry pi',
  'schematic',
  'avionics',
  'motors',
  'propulsion',
  'servo',
  'actuator',
  'actuators',
  'esc',
]);

const GENERIC_LANGUAGE_SUPPORT = new Set(['c', 'c++', 'c#', 'java', 'python', 'javascript', 'typescript', 'go', 'rust']);

function expandAnchors(anchors: string[], supporting: string[]) {
  const out = new Set(anchors.map(norm).filter(Boolean));
  let hardwareRole = false;
  for (const concept of [...anchors, ...supporting]) {
    const cleaned = norm(concept);
    if (!cleaned || GENERIC_LANGUAGE_SUPPORT.has(cleaned)) continue;
    if (HARDWARE_ANCHOR_ATOMS.has(cleaned)) {
      hardwareRole = true;
      out.add(cleaned);
    }
    for (const atom of cleaned.split(' ')) {
      if (HARDWARE_ANCHOR_ATOMS.has(atom)) {
        hardwareRole = true;
        out.add(atom);
      }
    }
  }
  // Once a role is clearly hardware/robotics, score against the full domain
  // vocabulary — not only the LLM's title-phrased anchors.
  if (hardwareRole) {
    for (const atom of HARDWARE_ANCHOR_ATOMS) out.add(atom);
  }
  return [...out];
}

const SOFTWARE_NOISE = [
  'react',
  'next.js',
  'nodejs',
  'node.js',
  'typescript',
  'javascript',
  'fullstack',
  'full stack',
  'full-stack',
  'frontend',
  'front-end',
  'backend',
  'back-end',
  'saas',
  'web app',
  'website',
  'bill splitting',
  'phishing',
  'blockchain',
  'deep learning',
  'portfolio',
  'roblox',
  'dungeons and dragons',
  'aws',
  'flask',
  'django',
  'mongodb',
  'postgres',
  'deskside support',
  'classroom support',
  'front desk',
  'it support',
  'help desk',
];

const WEAK_SOLO_ANCHORS = new Set(['hardware', 'sensor', 'sensors', 'testing', 'soc']);

function norm(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#/\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasConcept(text: string, concept: string) {
  const needle = norm(concept);
  if (!needle) return false;
  if (needle.includes(' ')) return text.includes(needle);
  return new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`).test(text);
}

function scoreUnit(params: {
  source: EvidenceUnit['source'];
  label: string;
  text: string;
  isInternship: boolean;
  anchors: string[];
  supporting: string[];
}): EvidenceUnit {
  const text = norm(params.text);
  const anchorHits = params.anchors.filter((concept) => hasConcept(text, concept));
  const supportingHits = params.supporting.filter((concept) => hasConcept(text, concept));
  const noiseHits = SOFTWARE_NOISE.filter((term) => text.includes(term));

  let score = 0;
  if (anchorHits.length) score += Math.min(0.7, 0.28 + anchorHits.length * 0.14);
  if (supportingHits.length) score += Math.min(0.2, supportingHits.length * 0.05);
  if (params.isInternship && anchorHits.length) score += 0.18;
  else if (params.isInternship) {
    // Even without description text, an engineering internship at a hardware-
    // adjacent org is stronger than a generic software internship.
    if (/\b(aerospace|avionics|robot|hardware|embedded|defense|semiconductor|electronics|moog|honeywell|spacex|nasa|qualcomm|texas instruments|intel|nvidia)\b/i.test(text)) {
      score += 0.42;
      if (!anchorHits.includes('hardware')) anchorHits.push('hardware');
    } else {
      score += 0.06;
    }
  }
  if (params.source === 'experience' && anchorHits.length) score += 0.1;
  if (params.source === 'project' && anchorHits.length) score += 0.08;
  // A lone weak word like "hardware" in IT support is not role proof.
  if (
    anchorHits.length === 1 &&
    WEAK_SOLO_ANCHORS.has(anchorHits[0]) &&
    supportingHits.length === 0 &&
    (noiseHits.length > 0 || /\b(support|assistant|help desk|deskside)\b/i.test(text))
  ) {
    score = Math.min(score, 0.12);
  }
  // Software-only dossiers must not outrank real hardware proof just because
  // they share a generic language skill like C/C++.
  if (!anchorHits.length && noiseHits.length) score = Math.min(score, 0.08);
  if (anchorHits.length && noiseHits.length >= 3 && supportingHits.length === 0) {
    score *= 0.55;
  }

  return {
    source: params.source,
    label: params.label.slice(0, 120),
    text,
    isInternship: params.isInternship,
    anchorHits,
    supportingHits,
    noiseHits,
    score: Math.max(0, Math.min(1, score)),
  };
}

function collectUnits(builder: any, projects: any[], anchors: string[], supporting: string[]): EvidenceUnit[] {
  const units: EvidenceUnit[] = [];

  for (const entry of builder?.experiences || []) {
    const label = [entry?.title, entry?.company].filter(Boolean).join(' at ') || 'Experience';
    const blob = [entry?.title, entry?.company, entry?.employmentType, entry?.description, entry?.builderContribution, ...(entry?.skills || [])].join(' ');
    const isInternship = /\b(?:intern(?:ship)?|co[-\s]?op|apprentice|fellow)\b/i.test(blob);
    units.push(
      scoreUnit({
        source: 'experience',
        label,
        text: blob,
        isInternship,
        anchors,
        supporting,
      })
    );
  }

  for (const project of projects || []) {
    const label = String(project?.projectName || 'Project');
    const blob = [
      project?.projectName,
      project?.description,
      project?.problemSolved,
      project?.builderContribution,
      ...(project?.techStack || []),
      ...(project?.contributionTags || []),
    ].join(' ');
    units.push(
      scoreUnit({
        source: 'project',
        label,
        text: blob,
        isInternship: false,
        anchors,
        supporting,
      })
    );
  }

  const skillBlob = [...(builder?.skills || []), ...(builder?.rolePreference || []), builder?.headline, builder?.bio]
    .filter(Boolean)
    .join(' ');
  if (skillBlob) {
    units.push(
      scoreUnit({
        source: 'skill',
        label: 'Profile skills',
        text: skillBlob,
        isInternship: false,
        anchors,
        supporting,
      })
    );
  }

  return units;
}

/**
 * Build a role-evidence dossier and a ranking score that prefers concrete
 * domain proof over skill-token overlap.
 */
export function buildRoleEvidenceDossier(params: {
  builder: any;
  projects: any[];
  roleEvidence?: {
    anchorConcepts?: string[];
    supportingConcepts?: string[];
    minimumAnchorMatches?: number;
    minimumTotalMatches?: number;
  } | null;
  requireInternship?: boolean;
}): RoleEvidenceDossier | null {
  const anchors = expandAnchors(
    (params.roleEvidence?.anchorConcepts || []).map(String),
    (params.roleEvidence?.supportingConcepts || []).map(String)
  );
  const supporting = (params.roleEvidence?.supportingConcepts || [])
    .map(String)
    .map(norm)
    .filter((concept) => concept && !GENERIC_LANGUAGE_SUPPORT.has(concept) && !anchors.includes(concept));
  if (!anchors.length) return null;

  const units = collectUnits(params.builder, params.projects, anchors, supporting)
    .filter((unit) => unit.score > 0 || unit.isInternship)
    .sort((a, b) => b.score - a.score);

  // Prefer concrete multi-concept proof. Lone weak tokens need a second signal.
  const bestUnits = units
    .filter((unit) => {
      if (unit.source === 'skill' || unit.score < 0.35) return false;
      if (unit.anchorHits.length >= 2) return true;
      if (unit.anchorHits.length === 1 && !WEAK_SOLO_ANCHORS.has(unit.anchorHits[0])) return true;
      return unit.anchorHits.length === 1 && unit.supportingHits.length > 0 && unit.score >= 0.55;
    })
    .slice(0, 4);
  const internshipUnits = units.filter((unit) => unit.isInternship);
  const hasRoleProof = bestUnits.length > 0;
  const hasInternshipProof = internshipUnits.length > 0;

  const top = bestUnits.slice(0, 3);
  const avgTop = top.length ? top.reduce((sum, unit) => sum + unit.score, 0) / top.length : 0;
  const internshipBoost =
    params.requireInternship && hasInternshipProof
      ? internshipUnits.some((unit) => unit.anchorHits.length) ? 0.18 : 0.08
      : hasInternshipProof && hasRoleProof
        ? 0.06
        : 0;
  const breadth = Math.min(0.12, bestUnits.length * 0.04);
  let evidenceFit = hasRoleProof ? Math.min(1, avgTop * 0.8 + breadth + internshipBoost) : 0.02;
  if (params.requireInternship && !hasInternshipProof) evidenceFit = Math.min(evidenceFit, 0.12);

  const proofBits = bestUnits.slice(0, 2).map((unit) => {
    const hits = [...unit.anchorHits, ...unit.supportingHits].slice(0, 3).join(', ');
    return `${unit.label}${hits ? ` (${hits})` : ''}`;
  });
  const internshipBit = internshipUnits[0]
    ? `Internship: ${internshipUnits[0].label}`
    : params.requireInternship
      ? 'Internship: missing'
      : null;
  const whyTheyMatch = [internshipBit, proofBits.length ? `Proof: ${proofBits.join('; ')}` : null]
    .filter(Boolean)
    .join('. ')
    .slice(0, 280);

  return {
    units,
    bestUnits,
    internshipUnits,
    evidenceFit,
    hasRoleProof,
    hasInternshipProof,
    whyTheyMatch: whyTheyMatch || 'No role-relevant evidence dossier.',
  };
}

export function opportunityRequiresInternship(opportunity: any) {
  const requirements = [
    ...(opportunity?.searchRequirements || []).map((entry: any) => String(entry?.text || '')),
    ...(opportunity?.requirements || []).map(String),
  ];
  return requirements.some((text) => /\bintern(?:ship)?\b|\bco[-\s]?op\b|\bfellow(?:ship)?\b/i.test(text));
}
