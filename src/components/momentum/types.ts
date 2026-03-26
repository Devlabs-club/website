export type MomentumApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface MomentumApplicationRecord {
  _id: string;
  userId: string;
  status: MomentumApplicationStatus;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  startupName: string;
  startupAge: string;
  founderType: string;
  startupDomain: string;
  hasCoFounder: boolean;
  numCoFounders: number;
  coFounderDetails: string;
  description: string;
  accomplishments: string;
  adjectives: string;
  websiteOrGithub: string;
  demoVideo: string;
  linkedin: string;
  twitter: string;
  pitchDeck: string;
  keyMetrics: string;
  hasRevenue: boolean;
  isIncorporated: boolean;
  hasRaisedMoney: boolean;
  lookingToFundraise: boolean;
  heardAboutUs: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
