import mongoose from 'mongoose';
import type { MomentumGroup } from './momentumApplication';

export type MomentumTaskType = 
  | 'checkpoint_attendance' 
  | 'checkpoint_submission' 
  | 'checkpoint_2_submission'
  | 'social_media' 
  | 'weekly_meetup';

export const TASK_POINTS: Record<MomentumTaskType, number> = {
  checkpoint_attendance: 30,
  checkpoint_submission: 30,
  checkpoint_2_submission: 30,
  social_media: 20,
  weekly_meetup: 20,
};

export const TASK_LABELS: Record<MomentumTaskType, string> = {
  checkpoint_attendance: 'Attending Mon-Fri Checkpoints',
  checkpoint_submission: 'Submission of Checkpoint 1',
  checkpoint_2_submission: 'Submission of Checkpoint 2',
  social_media: 'Weekly Social Media Engagement',
  weekly_meetup: 'Weekly Meetup (IRL/Online) with Crew',
};

export interface IMomentumTaskSubmission {
  userId: string;
  applicationId: string;
  group: MomentumGroup;
  taskType: MomentumTaskType;
  proofLink?: string;
  status: 'pending' | 'approved' | 'rejected';
  points: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const momentumTaskSubmissionSchema = new mongoose.Schema<IMomentumTaskSubmission>(
  {
    userId: { type: String, required: true, index: true },
    applicationId: { type: String, required: true, index: true },
    group: { 
      type: String, 
      enum: ['Velocity', 'Inertia', 'Flux', 'Gravity'], 
      required: true,
      index: true 
    },
    taskType: {
      type: String,
      enum: ['checkpoint_attendance', 'checkpoint_submission', 'checkpoint_2_submission', 'social_media', 'weekly_meetup'],
      required: true,
    },
    proofLink: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    points: { type: Number, required: true },
  },
  { timestamps: true }
);

export function getMomentumTaskSubmissionModel(conn: mongoose.Connection) {
  if (conn.models.MomentumTaskSubmission) {
    return conn.models.MomentumTaskSubmission as mongoose.Model<IMomentumTaskSubmission>;
  }
  return conn.model<IMomentumTaskSubmission>(
    'MomentumTaskSubmission',
    momentumTaskSubmissionSchema,
    'momentum_task_submissions'
  );
}