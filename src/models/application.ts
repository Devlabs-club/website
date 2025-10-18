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
 * Gender enum
 */
export const Gender = {
  MALE: 'male',
  FEMALE: 'female',
  NON_BINARY: 'non-binary',
} as const;

export type GenderType = typeof Gender[keyof typeof Gender];

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
  // Academic
  major: string;

  // Personal & Contact (captured at application time)
  name: string;
  gender: GenderType;
  dob: Date;
  email: string;
  phone: string;
  country: string;

  // Links & portfolio
  linkedin: string; // required
  github: string; // required
  personalWebsite?: string; // optional
  portfolio?: string; // optional
  favoriteLink?: string; // optional
  twitterHandle?: string; // optional (@handle or URL)

  // Story
  coolestThing: string; // required
  hackathonStory: string; // required
  additionalInfo?: string; // optional
  projectIdea?: string; // optional
  referralSource?: string; // optional
  proofOfWork?: string; // optional (can contain one or more URLs)

  // Deprecated (set to null on writes)
  track?: string | null;
  teamName?: Types.ObjectId | null;
  teamPreference?: TeamPreferenceType | null;
  tShirtSize?: string | null;
  dietaryRestrictions?: string | null;
  whyJoin?: string | null;

  // Resume (REQUIRED)
  resumeUrl: string;

  // Computed server-side
  progress?: number;
  metadata?: ApplicationMetadata;
  createdAt: Date;
}

/**
 * Application input type (for API requests)
 */
export interface ApplicationInput {
  // Academic
  major: string;

  // Personal & Contact
  name: string;
  gender: GenderType;
  dob: Date | string;
  email: string;
  phone: string;
  country: string;

  // Links & portfolio
  linkedin: string;
  github: string;
  personalWebsite?: string;
  portfolio?: string;
  favoriteLink?: string;
  twitterHandle?: string;

  // Story
  coolestThing: string;
  hackathonStory: string;
  additionalInfo?: string;
  projectIdea?: string;
  referralSource?: string;
  proofOfWork?: string;

  // Resume (REQUIRED)
  resumeUrl: string;
}

/**
 * Zod schema for validating application input
 */
export const ApplicationInputSchema = z.object({
  // Academic
  major: z.string().min(1, 'Major is required'),

  // Personal & Contact
  name: z.string().min(2, 'Name is required'),
  gender: z.enum(['male', 'female', 'non-binary']),
  dob: z.coerce.date({ invalid_type_error: 'Invalid date of birth' }),
  email: z.string().email('Invalid email'),
  phone: z
    .string()
    .min(7, 'Invalid phone number')
    .max(20, 'Invalid phone number')
    .regex(/^[+()\- \d]+$/, 'Invalid phone number'),
  country: z.string().min(1, 'Country is required'),

  // Links & portfolio
  linkedin: z.string().url('Invalid LinkedIn URL'),
  github: z.string().url('Invalid GitHub URL'),
  personalWebsite: z.string().url('Invalid URL').optional(),
  portfolio: z.string().url('Invalid URL').optional(),
  favoriteLink: z.string().url('Invalid URL').optional(),
  twitterHandle: z
    .string()
    .optional()
    .refine(
      (val) =>
        !val ||
        /^@?[A-Za-z0-9_]{1,15}$/.test(val) ||
        /^https?:\/\//i.test(val),
      { message: 'Twitter handle must be @handle or a valid URL' }
    ),

  // Story
  coolestThing: z.string().min(1, 'This field is required'),
  hackathonStory: z.string().min(1, 'This field is required'),
  additionalInfo: z.string().optional(),
  projectIdea: z.string().optional(),
  referralSource: z.string().optional(),
  proofOfWork: z.string().optional(),

  // Resume (REQUIRED)
  resumeUrl: z.string().url('Invalid resume URL'),
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

/**
 * Utility: ensure deprecated fields are explicitly nulled in outgoing writes
 */
export const DeprecatedFields = {
  track: null as string | null,
  teamName: null as string | null,
  teamPreference: null as TeamPreferenceType | null,
  tShirtSize: null as string | null,
  dietaryRestrictions: null as string | null,
  whyJoin: null as string | null,
};
