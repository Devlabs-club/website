import mongoose from 'mongoose';
import type { MomentumGroup } from './momentumApplication';
import {
  TASK_LABELS,
  TASK_POINTS,
  type MomentumTaskType,
} from '../lib/momentumTasks';

export type { MomentumTaskType };
export { TASK_POINTS, TASK_LABELS };

export interface IMomentumTaskSubmission {
  userId: string;
  applicationId: string;
  group: MomentumGroup;
  taskType: MomentumTaskType;
  /** Primary proof URL (tweet, Drive, deck, etc. depending on checkpoint). */
  proofLink?: string;
  /** Optional second URL — required for Checkpoint 5 (pitch deck). */
  proofLinkSecondary?: string;
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
      index: true,
    },
    taskType: {
      type: String,
      enum: [
        'checkpoint_attendance',
        'checkpoint_submission',
        'checkpoint_2_submission',
        'checkpoint_3_submission',
        'checkpoint_4_submission',
        'checkpoint_5_submission',
        'social_media',
        'weekly_meetup',
      ],
      required: true,
    },
    proofLink: { type: String, trim: true },
    proofLinkSecondary: { type: String, trim: true },
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
