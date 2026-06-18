export type SearchReadyOpportunity = {
  title?: string | null;
  roleTitle?: string | null;
  builderWillDo?: string | null;
  startupSummary?: string | null;
  description?: string | null;
  skillsNeeded?: string[] | null;
  matchingSkills?: string[] | null;
};

export function canRunPreviewAnyway(opportunity: SearchReadyOpportunity): boolean {
  const role = String(opportunity.roleTitle || opportunity.title || '').trim();
  const buildContext = String(
    opportunity.builderWillDo || opportunity.description || opportunity.startupSummary || ''
  ).trim();
  const skills =
    (Array.isArray(opportunity.matchingSkills) && opportunity.matchingSkills.length > 0) ||
    (Array.isArray(opportunity.skillsNeeded) && opportunity.skillsNeeded.length > 0);

  return Boolean(role) && role !== 'New role' && Boolean(buildContext) && skills;
}
