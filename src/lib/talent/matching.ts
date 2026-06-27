import BuilderProfile from '@/models/talent/BuilderProfile';

export type DeterministicMatchMethod = 'email_exact' | 'full_name_unique' | 'first_last_unique';
export type ExcludedMatchMethod = 'first_name_unique' | 'ambiguous_name' | 'no_match';

export function normalizeString(input: string | null | undefined) {
  return (input || '').trim().toLowerCase();
}

export function cleanName(input: string | null | undefined) {
  return normalizeString(input).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildFirstLastKey(name: string) {
  const parts = cleanName(name).split(' ').filter(Boolean);
  if (parts.length < 2) return '';
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export async function deterministicBuilderMatch(input: {
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}) {
  const email = normalizeString(input.email);
  if (email) {
    const emailMatch = await BuilderProfile.findOne({ email }).select('_id name email').lean();
    if (emailMatch) {
      return { method: 'email_exact' as DeterministicMatchMethod, builder: emailMatch, confidence: 1 };
    }
  }

  const mergedName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  const fallbackName = input.fullName?.trim() || mergedName;
  const cleaned = cleanName(fallbackName);
  if (!cleaned) {
    return { method: 'no_match' as ExcludedMatchMethod, builder: null, confidence: 0 };
  }

  const fullMatches = await BuilderProfile.find({ name: { $regex: `^${cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
    .select('_id name email')
    .lean();

  if (fullMatches.length === 1) {
    return { method: 'full_name_unique' as DeterministicMatchMethod, builder: fullMatches[0], confidence: 0.95 };
  }
  if (fullMatches.length > 1) {
    return { method: 'ambiguous_name' as ExcludedMatchMethod, builder: null, confidence: 0.3 };
  }

  const firstLast = buildFirstLastKey(cleaned);
  if (firstLast) {
    const regex = new RegExp(`^${firstLast.split(' ')[0]}\\b.*\\b${firstLast.split(' ')[1]}$`, 'i');
    const firstLastMatches = await BuilderProfile.find({ name: regex }).select('_id name email').lean();
    if (firstLastMatches.length === 1) {
      return { method: 'first_last_unique' as DeterministicMatchMethod, builder: firstLastMatches[0], confidence: 0.9 };
    }
    if (firstLastMatches.length > 1) {
      return { method: 'ambiguous_name' as ExcludedMatchMethod, builder: null, confidence: 0.3 };
    }
  }

  const first = cleaned.split(' ')[0];
  if (first) {
    const firstMatches = await BuilderProfile.find({ name: { $regex: `^${first}\\b`, $options: 'i' } }).select('_id name email').lean();
    if (firstMatches.length === 1) {
      return { method: 'first_name_unique' as ExcludedMatchMethod, builder: firstMatches[0], confidence: 0.55 };
    }
    if (firstMatches.length > 1) {
      return { method: 'ambiguous_name' as ExcludedMatchMethod, builder: null, confidence: 0.25 };
    }
  }

  return { method: 'no_match' as ExcludedMatchMethod, builder: null, confidence: 0 };
}

export function computeBuilderScores(builder: any, projects: any[] = []) {
  // 1. Profile Completion Score
  const profileChecks = [
    Boolean(builder?.name),
    Boolean(builder?.email),
    Boolean(builder?.availability?.availableNow !== undefined),
    Boolean(builder?.availability?.hoursPerWeek),
    Array.isArray(builder?.rolePreference) && builder.rolePreference.length > 0,
    Array.isArray(builder?.preferredWorkType) && builder.preferredWorkType.length > 0,
  ];
  const profileScore = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);

  const profileCompletionLabel =
    profileScore < 50 ? 'Incomplete'
      : profileScore < 85 ? 'Mostly Filled'
        : 'Complete';

  // 2. Proof Strength Score
  let proofScore = 0;
  let hasProofLink = false;
  let hasContribution = false;
  
  if (projects.length > 0) {
    proofScore += 40; // Base score for having a project
    if (projects.length >= 2) proofScore += 20;
    
    // Check if any project has a link
    hasProofLink = projects.some(p => p.links?.github || p.links?.devpost || p.links?.demo || p.links?.portfolio || p.links?.screenshots);
    if (hasProofLink) proofScore += 20;

    // Check if any project has clear contribution
    hasContribution = projects.some(p => p.builderContribution && p.builderContribution.length > 10);
    if (hasContribution) proofScore += 20;
  }
  
  // Also consider builder links as proof
  if (builder?.links?.github || builder?.links?.resume || builder?.links?.portfolio) {
    proofScore += 20;
  }
  
  proofScore = Math.min(100, proofScore);

  // Compute Proof Strength Label
  const hasVerifiedProject = projects.some(p =>
    ['admin_verified', 'founder_verified', 'peer_confirmed'].includes(p.verificationStatus)
  );
  const isVerifiedBuilder = ['admin_verified', 'founder_verified', 'peer_confirmed'].includes(builder?.verificationStatus);

  const proofStrengthLabel =
    (hasVerifiedProject || isVerifiedBuilder) ? 'Verified Proof'
      : proofScore >= 80 ? 'Strong Proof'
        : proofScore >= 50 ? 'Solid Proof'
          : proofScore >= 20 ? 'Basic Proof'
            : 'Thin Proof';

  // 3. Match Readiness Score
  // Requires profile completion + at least one proof-of-work project
  let matchScore = 0;
  if (profileScore >= 80 && projects.length > 0) {
    matchScore = Math.round((profileScore * 0.4) + (proofScore * 0.6));
  } else if (profileScore >= 50) {
    matchScore = Math.round(profileScore * 0.5);
  }

  const missingItems: string[] = [];
  if (!builder?.links?.github && !builder?.links?.resume && !builder?.links?.portfolio) missingItems.push('Add GitHub or Resume');
  if (!builder?.availability?.hoursPerWeek) missingItems.push('Set weekly availability');
  if (!builder?.preferredWorkType?.length) missingItems.push('Select preferred work types');
  if (!Array.isArray(builder?.rolePreference) || builder.rolePreference.length === 0) missingItems.push('Set role preferences');
  if (projects.length === 0) missingItems.push('Add a proof-of-work project');
  else if (!hasContribution) missingItems.push('Add your contribution to projects');

  const eligibility = matchScore >= 80 ? 'priority' : matchScore >= 60 ? 'eligible' : 'not_eligible';

  return { 
    profileScore, 
    proofScore, 
    matchScore, 
    score: matchScore, // legacy fallback
    missingItems, 
    eligibility,
    profileCompletionLabel,
    proofStrengthLabel
  };
}

// Legacy fallback for places that don't pass projects
export function computeProfileCompletion(builder: any) {
  return computeBuilderScores(builder, []);
}
