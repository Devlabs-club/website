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
  'actuators',
  'esc',
]);

const SECURITY_ANCHOR_ATOMS = new Set([
  'cybersecurity',
  'infosec',
  'information security',
  'ethical hacking',
  'ethical hacker',
  'penetration testing',
  'penetration test',
  'pentest',
  'vulnerability',
  'vulnerabilities',
  'appsec',
  'application security',
  'product security',
  'network security',
  'cloud security',
  'soc',
  'siem',
  'malware',
  'cryptography',
  'cryptograph',
  'reverse engineering',
  'bug bounty',
  'ctf',
  'capture the flag',
  'owasp',
  'threat intelligence',
  'incident response',
  'red team',
  'blue team',
  'exploit',
  'phishing',
  'nmap',
  'wireshark',
  'metasploit',
  'kali',
]);

const AI_ANCHOR_ATOMS = new Set([
  'machine learning',
  'deep learning',
  'llm',
  'large language model',
  'rag',
  'retrieval augmented',
  'pytorch',
  'tensorflow',
  'neural network',
  'embeddings',
  'transformers',
  'nlp',
  'computer vision',
]);

/**
 * "Robotics"/"mechatronics" anchors previously only pulled in physical
 * hardware-component vocabulary (circuit, pcb, servo, motors...). That misses
 * robotics roles that are actually software-first — autonomous navigation,
 * SLAM, motion planning — where a candidate's real proof is expressed in
 * algorithm/framework terms, not component terms. Robotics/mechatronics
 * anchors adopt this pack too so both kinds of proof count.
 */
const ROBOTICS_SOFTWARE_ANCHOR_ATOMS = new Set([
  'robotics',
  'robot',
  'mechatronics',
  'ros',
  'ros2',
  'robot operating system',
  'slam',
  'gazebo',
  'moveit',
  'rviz',
  'nav2',
  'cartographer',
  'navigation',
  'autonomous',
  'autonomy',
  'motion planning',
  'path planning',
  'trajectory planning',
  'kinematics',
  'inverse kinematics',
  'teleoperation',
  'localization',
  'mapping',
  'pid controller',
  'pid control',
  'sensor fusion',
  // Physical platforms / autonomy payloads — same domain family as ROS/SLAM,
  // expressed in project prose more often than in skill lists.
  'rover',
  'drone',
  'uav',
  'quadcopter',
  'autopilot',
  'stm32',
  'imu',
  'lidar',
  'actuator',
  'actuators',
]);

const DOMAIN_VOCAB_PACKS: Array<{ id: string; atoms: Set<string> }> = [
  { id: 'security', atoms: SECURITY_ANCHOR_ATOMS },
  { id: 'hardware', atoms: HARDWARE_ANCHOR_ATOMS },
  { id: 'ai', atoms: AI_ANCHOR_ATOMS },
  { id: 'robotics_software', atoms: ROBOTICS_SOFTWARE_ANCHOR_ATOMS },
];

const GENERIC_LANGUAGE_SUPPORT = new Set(['c', 'c++', 'c#', 'java', 'python', 'javascript', 'typescript', 'go', 'rust']);

/** Expand proof/retrieval terms using domain vocab packs when any seed matches a pack. Role-agnostic. */
export function expandDomainProofTerms(
  seeds: Array<string | null | undefined>,
  /**
   * Seeds allowed to pull in a pack's full vocabulary. Defaults to every seed.
   * Callers pass the role's anchors here so that a merely supporting skill
   * (a robotics role listing "computer vision") cannot import an unrelated
   * domain's terms and hand out role proof nobody earned.
   */
  adoptSeeds: Array<string | null | undefined> = seeds
): string[] {
  const out = new Set<string>();
  const named = new Set<string>();
  const brushed = new Map<string, Set<string>>();
  const noteBrush = (packId: string, atom: string) => {
    const hits = brushed.get(packId) || new Set<string>();
    hits.add(atom);
    brushed.set(packId, hits);
  };
  const adoptable = new Set(
    adoptSeeds.map((seed) => norm(String(seed || ''))).filter(Boolean)
  );

  for (const seed of seeds) {
    const cleaned = norm(String(seed || ''));
    if (!cleaned || GENERIC_LANGUAGE_SUPPORT.has(cleaned)) continue;
    out.add(cleaned);
    if (!adoptable.has(cleaned)) continue;
    for (const pack of DOMAIN_VOCAB_PACKS) {
      // The seed *is* a pack term — the role names this domain outright.
      if (pack.atoms.has(cleaned)) {
        named.add(pack.id);
        continue;
      }
      for (const atom of cleaned.split(' ')) {
        if (pack.atoms.has(atom)) noteBrush(pack.id, atom);
      }
      for (const atom of pack.atoms) {
        if (atom.includes(' ') && cleaned.includes(atom)) noteBrush(pack.id, atom);
      }
    }
  }

  // Adopt a pack's full vocabulary when the role names it directly, or brushes
  // it repeatedly. A single glancing phrase must not: "computer vision for
  // robotics" once pulled the whole AI vocabulary into a robotics search, which
  // handed LLM researchers role proof they had not earned.
  for (const pack of DOMAIN_VOCAB_PACKS) {
    const adopt = named.has(pack.id) || (brushed.get(pack.id)?.size || 0) >= 2;
    if (!adopt) continue;
    for (const atom of pack.atoms) out.add(atom);
  }
  return [...out];
}

function expandAnchors(anchors: string[], supporting: string[]) {
  return expandDomainProofTerms([...anchors, ...supporting], anchors);
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
  'blockchain',
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

const WEAK_SOLO_ANCHORS = new Set(['hardware', 'sensor', 'sensors', 'testing']);

/** Course TA / grader / instructional roles are not practiced domain proof. */
const INSTRUCTIONAL_EVIDENCE_RE =
  /\b(?:teaching assistant|undergraduate teaching|ugta|grader|instructional aide|course assistant|lab assistant|tutor)\b/i;
const COURSE_CODE_RE = /\b(?:cse|ece|eee|cs|me|mae|bme)\s*-?\s*\d{2,4}\b/i;

function isInstructionalEvidence(label: string, text: string): boolean {
  if (INSTRUCTIONAL_EVIDENCE_RE.test(label) || INSTRUCTIONAL_EVIDENCE_RE.test(text)) return true;
  return COURSE_CODE_RE.test(text) && /\b(?:assistant|grader|aide|tutor)\b/i.test(`${label} ${text}`);
}

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
  // Lenient trailing-s match: "robotics" anchor should hit "Robotic Arm" text
  // and "motors" should hit "Motor mixing" — both differ from the anchor word
  // by exactly one trailing "s" (plural, or noun/adjective form). Guarded by
  // length so short acronyms like "ros" don't get stripped down to "ro".
  const stem = needle.length > 4 && needle.endsWith('s') ? needle.slice(0, -1) : needle;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}s?(?=\\s|$)`).test(text);
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
    // Domain-adjacent internships count even with thin descriptions when
    // the role plan's expanded anchors appear in the experience text.
    if (params.anchors.some((anchor) => hasConcept(text, anchor))) {
      score += 0.42;
    } else {
      score += 0.06;
    }
  }
  if (params.source === 'experience' && anchorHits.length) score += 0.1;
  if (params.source === 'project' && anchorHits.length) score += 0.08;
  // Title/label hits are stronger than buried description mentions — a role
  // titled "Rover Systems Engineer" or project named "Autonomous Car" is the
  // center of the work, not a passing keyword.
  const labelText = norm(params.label);
  const labelAnchorHits = params.anchors.filter((concept) => hasConcept(labelText, concept));
  if (labelAnchorHits.length && anchorHits.length) {
    score += Math.min(0.22, 0.1 + labelAnchorHits.length * 0.06);
  }
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
  // Teaching a domain course is not the same as practicing the domain. Cap
  // instructional evidence so course TAs cannot outrank builders with shipped
  // projects or engineering roles — applies to every role family.
  if (isInstructionalEvidence(params.label, text)) {
    score = Math.min(score, 0.28);
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
