export type AgentOptionItem = {
  id: string;
  label: string;
  description?: string;
  value: string;
};

export type AgentOptionsBlock = {
  type: 'options';
  question: string;
  options: AgentOptionItem[];
  allowCustom?: boolean;
};

export type AgentConfirmationBlock = {
  type: 'confirmation';
  title: string;
  description: string;
  actionName: string;
  payload: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  preview?: {
    before?: string;
    after?: string;
    message?: string;
  };
  confirmLabel: string;
  editLabel?: string;
  cancelLabel: string;
};

export type AgentCandidateCardBlock = {
  type: 'candidate_card';
  builderId: string;
  name: string;
  matchLabel: string;
  fitScore: number;
  confidence: 'low' | 'medium' | 'high';
  strongestSignals: string[];
  concerns: string[];
  missingEvidence: string[];
  bestUseCase: string;
  recommendedAction: 'request_intro' | 'send_trial' | 'save' | 'reject' | 'review_more';
  topProjects: Array<{ title: string; contribution: string; verified: boolean }>;
};

export type AgentSearchQualityBlock = {
  type: 'search_quality_report';
  totalScanned: number;
  totalRetrieved: number;
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  poolStrength: 'weak' | 'medium' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  bottlenecks: string[];
  suggestedRelaxations: string[];
  suggestedNextAction: string;
};

export type AgentProfileDiagnosisBlock = {
  type: 'profile_diagnosis';
  overallScore: number;
  label: string;
  summary: string;
  topIssue: string;
  issues: Array<{ title: string; detail: string }>;
  suggestedFixes: string[];
};

export type AgentUiBlock =
  | AgentOptionsBlock
  | AgentConfirmationBlock
  | AgentCandidateCardBlock
  | AgentSearchQualityBlock
  | AgentProfileDiagnosisBlock
  | { type: string; [key: string]: unknown };

export const HIRE_TYPE_OPTIONS: AgentOptionItem[] = [
  { id: 'full_time', label: 'Full-time', value: 'full_time', description: 'Full-time employee or contractor committed to the role' },
  { id: 'internship', label: 'Internship', value: 'internship', description: 'Internship — part-time, learning-focused, structured' },
  { id: 'either', label: 'Either works', value: 'either', description: "Open to either — cast a wider net" },
];

export const SEARCH_MODE_OPTIONS: AgentOptionItem[] = [
  { id: 'broad', label: 'Broad', value: 'broad', description: 'Cast a wide net — more candidates, looser skill matching' },
  { id: 'balanced', label: 'Balanced', value: 'balanced', description: 'Mix of quality and volume — recommended starting point' },
  { id: 'strict', label: 'Strict', value: 'strict', description: 'Only strong matches — fewer results, higher signal' },
];

export const REJECTION_REASON_OPTIONS: AgentOptionItem[] = [
  { id: 'wrong_skills', label: 'Wrong skill set', value: 'wrong_skills' },
  { id: 'weak_proof', label: 'Weak proof', value: 'weak_proof' },
  { id: 'unclear_contribution', label: 'Unclear contribution', value: 'unclear_contribution' },
  { id: 'weak_backend', label: 'Not enough backend depth', value: 'weak_backend' },
  { id: 'weak_frontend', label: 'Not enough frontend/design quality', value: 'weak_frontend' },
  { id: 'availability_mismatch', label: 'Availability mismatch', value: 'availability_mismatch' },
  { id: 'too_junior', label: 'Too junior', value: 'too_junior' },
];

export const SAVE_REASON_OPTIONS: AgentOptionItem[] = [
  { id: 'strong_project', label: 'Strong relevant project', value: 'strong_project' },
  { id: 'strong_stack', label: 'Strong technical stack', value: 'strong_stack' },
  { id: 'clear_contribution', label: 'Clear personal contribution', value: 'clear_contribution' },
  { id: 'startup_experience', label: 'Strong startup experience', value: 'startup_experience' },
  { id: 'good_availability', label: 'Good availability', value: 'good_availability' },
];

export function makeHireTypeOptionsBlock(): AgentOptionsBlock {
  return {
    type: 'options',
    question: 'What kind of hire are you looking for?',
    options: HIRE_TYPE_OPTIONS,
  };
}

export function makeSearchModeOptionsBlock(): AgentOptionsBlock {
  return {
    type: 'options',
    question: 'How broad should I search?',
    options: SEARCH_MODE_OPTIONS,
  };
}

export function makeIntroConfirmationBlock(params: {
  builderName: string;
  message: string;
  builderId: string;
  opportunityId: string;
}): AgentConfirmationBlock {
  return {
    type: 'confirmation',
    title: `Send intro to ${params.builderName}?`,
    description: 'This will notify the builder and open a message thread.',
    actionName: 'request_intro',
    payload: { builderName: params.builderName, builderId: params.builderId, opportunityId: params.opportunityId, message: params.message },
    riskLevel: 'medium',
    preview: { message: params.message },
    confirmLabel: 'Send intro',
    editLabel: 'Edit message',
    cancelLabel: 'Cancel',
  };
}

export function makeRejectionOptionsBlock(): AgentOptionsBlock {
  return {
    type: 'options',
    question: 'Why are you passing on this candidate?',
    options: REJECTION_REASON_OPTIONS,
    allowCustom: true,
  };
}

export function makeSaveReasonOptionsBlock(): AgentOptionsBlock {
  return {
    type: 'options',
    question: 'What stood out about this candidate?',
    options: SAVE_REASON_OPTIONS,
    allowCustom: true,
  };
}
