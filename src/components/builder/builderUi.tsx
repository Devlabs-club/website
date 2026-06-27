export function formatWorkType(workType?: string | string[] | null): string {
  if (!workType) return 'Any';
  if (Array.isArray(workType)) {
    return workType.map((w) => w.replace(/_/g, ' ')).join(', ') || 'Any';
  }
  return String(workType).replace(/_/g, ' ');
}

export function getProjectImageUrl(project: { links?: { screenshots?: string } }) {
  return project.links?.screenshots?.split(/[,\s|]+/).find((url) => /^https?:\/\//i.test(url));
}

export function getMatchLabel(score: number) {
  if (score >= 90) return 'Match Ready';
  if (score >= 70) return 'Almost Ready';
  if (score >= 40) return 'In Progress';
  return 'Getting Started';
}
