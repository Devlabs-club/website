import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * Application status enum
 */
export const ApplicationStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ApplicationStatusType = typeof ApplicationStatus[keyof typeof ApplicationStatus];

/**
 * Team preference enum
 */
export const TeamPreference = {
  HAS_TEAM: 'hasTeam',
  NEED_TEAM: 'needTeam',
  SOLO: 'solo',
} as const;

export type TeamPreferenceType = typeof TeamPreference[keyof typeof TeamPreference];

/**
 * Application metadata interface
 */
export interface ApplicationMetadata {
  naturalKey?: string;
}

/**
 * Application document interface (matches MongoDB document)
 */
export interface IApplication {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  status: ApplicationStatusType;
  major: string;
  track?: string;
  teamName?: Types.ObjectId;
  teamPreference?: TeamPreferenceType;
  tShirtSize?: string;
  dietaryRestrictions?: string;
  whyJoin?: string;
  resumeUrl?: string;
  metadata?: ApplicationMetadata;
  createdAt: Date;
}

/**
 * Application input type (for API requests)
 */
export interface ApplicationInput {
  major: string;
  track?: string;
  teamName?: string; // ObjectId as string
  teamPreference?: TeamPreferenceType;
  tShirtSize?: string;
  dietaryRestrictions?: string;
  whyJoin?: string;
  resumeUrl?: string;
}

/**
 * Zod schema for validating application input
 */
export const ApplicationInputSchema = z.object({
  major: z.string().min(1, 'Major is required'),
  track: z.string().optional(),
  teamName: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid team ID').optional(),
  teamPreference: z.enum(['hasTeam', 'needTeam', 'solo']).optional(),
  tShirtSize: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  whyJoin: z.string().optional(),
  resumeUrl: z.string().url().optional(),
});

/**
 * Type guard to check if a value is a valid ApplicationStatusType
 */
export function isValidStatus(status: string): status is ApplicationStatusType {
  return Object.values(ApplicationStatus).includes(status as ApplicationStatusType);
}

/**
 * Type guard to check if a value is a valid TeamPreferenceType
 */
export function isValidTeamPreference(preference: string): preference is TeamPreferenceType {
  return Object.values(TeamPreference).includes(preference as TeamPreferenceType);
}
