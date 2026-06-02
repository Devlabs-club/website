/** Client-safe momentum task metadata (no mongoose). */

export type MomentumTaskType =
  | 'checkpoint_attendance'
  | 'checkpoint_submission'
  | 'checkpoint_2_submission'
  | 'checkpoint_3_submission'
  | 'checkpoint_4_submission'
  | 'checkpoint_5_submission'
  | 'social_media'
  | 'weekly_meetup';

export const TASK_POINTS: Record<MomentumTaskType, number> = {
  checkpoint_attendance: 30,
  checkpoint_submission: 30,
  checkpoint_2_submission: 30,
  checkpoint_3_submission: 30,
  checkpoint_4_submission: 30,
  checkpoint_5_submission: 30,
  social_media: 20,
  weekly_meetup: 20,
};

export const TASK_LABELS: Record<MomentumTaskType, string> = {
  checkpoint_attendance: 'Attending Mon-Fri Checkpoints',
  checkpoint_submission: 'Submission of Checkpoint 1',
  checkpoint_2_submission: 'Submission of Checkpoint 2',
  checkpoint_3_submission: 'Submission of Checkpoint 3',
  checkpoint_4_submission: 'Submission of Checkpoint 4',
  checkpoint_5_submission: 'Submission of Checkpoint 5',
  social_media: 'Weekly Social Media Engagement',
  weekly_meetup: 'Weekly Meetup (IRL/Online) with Crew',
};
