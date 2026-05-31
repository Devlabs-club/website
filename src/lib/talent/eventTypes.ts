export const EVENT_TYPES = [
  'hackathon',
  'workshop',
  'hacker_house',
  'demo_day',
  'founder_sprint',
  'momentum',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const REGISTRATION_STATUSES = ['draft', 'open', 'closed'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const FORM_FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'single_select',
  'multi_select',
  'checkbox',
  'number',
  'date',
  'file_url',
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type EventFormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  order: number;
};

export type EventFormSchema = {
  fields: EventFormField[];
};

export type EventRegistrationStatus =
  | 'submitted'
  | 'withdrawn'
  | 'waitlisted'
  | 'accepted'
  | 'rejected';

export type FormResponseValue = string | string[] | boolean | number;

export type EventPublicData = {
  _id: string;
  name: string;
  slug: string;
  date: string;
  endDate?: string | null;
  type: EventType;
  location?: string | null;
  description?: string | null;
  headerImageUrl?: string | null;
  websiteUrl?: string | null;
  registrationStatus: RegistrationStatus;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  formSchema?: EventFormSchema;
};

export function slugifyEventName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
