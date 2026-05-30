/**
 * Smoke test for hiring flow helpers (no DB required for pure functions).
 */
import {
  pipelineNextStep,
  syncMatchPipelineStatus,
  PIPELINE_TO_MATCH_STATUS,
} from '../src/lib/talent/founderPipeline';
import { normalizeTrialProject } from '../src/lib/talent/founderTrialProject';

const match = { status: 'approved', pipelineNextStep: null };

syncMatchPipelineStatus(match, 'builder_interested');
if (match.status !== PIPELINE_TO_MATCH_STATUS.builder_interested) {
  throw new Error('syncMatchPipelineStatus failed');
}

const step = pipelineNextStep('interviewing', {
  callScheduleStatus: 'confirmed',
  callCompletedAt: null,
});
if (!step.includes('Mark call complete')) {
  throw new Error(`Unexpected interviewing step: ${step}`);
}

const trial = normalizeTrialProject({
  title: 'Test sprint',
  goal: 'Ship MVP',
  deliverables: ['Demo'],
  successCriteria: ['Works end-to-end'],
  status: 'submitted',
  rejectionCount: 2,
});
if (!trial || trial.rejectionCount !== 2) {
  throw new Error('normalizeTrialProject lifecycle fields failed');
}

console.log('Hiring flow smoke tests passed.');
