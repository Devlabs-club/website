/**
 * Maps a user's onboarding progress to the route they should resume at.
 *
 * Used after billing checkout (and anywhere we need to drop a partially
 * onboarded user back into the exact step they left off) so a founder who
 * pays before finishing setup lands on their next incomplete step rather than
 * a blank dashboard.
 */

export type ResumeAccountType = 'founder' | 'builder' | null | undefined;

/** onboardingStatus -> onboarding page, in flow order. */
const FOUNDER_STEP_ROUTES: Record<string, string> = {
  linkedin: '/founder/onboarding/linkedin',
  profile: '/founder/onboarding/linkedin?step=profile',
  company: '/founder/onboarding/linkedin?step=experiences',
  context: '/founder/onboarding/context',
  complete: '/founder/home',
};

const BUILDER_STEP_ROUTES: Record<string, string> = {
  imessage_claim: '/builder/home',
  complete: '/builder/home',
};

/**
 * Resolve where an account should land based on how far it got in onboarding.
 * Unknown/absent status falls back to the account's home.
 */
export function onboardingResumePath(
  accountType: ResumeAccountType,
  onboardingStatus?: string | null
): string {
  const status = (onboardingStatus || '').trim();
  if (accountType === 'builder') {
    return BUILDER_STEP_ROUTES[status] || '/builder/home';
  }
  // Default to founder routing (checkout is founder-only today).
  return FOUNDER_STEP_ROUTES[status] || '/founder/home';
}
