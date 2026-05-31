import type {
  EventFormField,
  EventFormSchema,
  FormResponseValue,
  RegistrationStatus,
} from './eventTypes';
import { isValidHttpUrl } from './eventTypes';

type EventLike = {
  registrationStatus: RegistrationStatus;
  registrationOpensAt?: Date | string | null;
  registrationClosesAt?: Date | string | null;
  formSchema?: EventFormSchema | { fields?: EventFormField[] };
};

export function isRegistrationOpen(event: EventLike, now = new Date()): boolean {
  if (event.registrationStatus !== 'open') return false;

  const opensAt = event.registrationOpensAt ? new Date(event.registrationOpensAt) : null;
  const closesAt = event.registrationClosesAt ? new Date(event.registrationClosesAt) : null;

  if (opensAt && now < opensAt) return false;
  if (closesAt && now > closesAt) return false;
  return true;
}

function validateFieldValue(
  field: EventFormField,
  value: FormResponseValue | undefined
): string | null {
  const isEmpty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  if (field.required && isEmpty) {
    return `${field.label} is required`;
  }

  if (isEmpty) return null;

  switch (field.type) {
    case 'short_text':
    case 'long_text':
    case 'phone':
      if (typeof value !== 'string') return `${field.label} must be text`;
      return null;
    case 'email':
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return `${field.label} must be a valid email`;
      }
      return null;
    case 'url':
    case 'file_url':
      if (typeof value !== 'string' || !isValidHttpUrl(value)) {
        return `${field.label} must be a valid URL`;
      }
      return null;
    case 'single_select':
      if (typeof value !== 'string') return `${field.label} must be a single choice`;
      if (field.options?.length && !field.options.includes(value)) {
        return `${field.label} has an invalid selection`;
      }
      return null;
    case 'multi_select':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        return `${field.label} must be a list of choices`;
      }
      if (field.options?.length) {
        const invalid = value.some((v) => !field.options!.includes(v));
        if (invalid) return `${field.label} has invalid selections`;
      }
      return null;
    case 'checkbox':
      if (typeof value !== 'boolean') return `${field.label} must be yes or no`;
      return null;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return `${field.label} must be a number`;
      }
      return null;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        return `${field.label} must be a valid date`;
      }
      return null;
    default:
      return null;
  }
}

export function validateRegistrationResponses(
  formSchema: EventFormSchema | undefined,
  responses: Record<string, FormResponseValue>
): { valid: boolean; errors: Record<string, string>; sanitized: Record<string, FormResponseValue> } {
  const fields = [...(formSchema?.fields || [])].sort((a, b) => a.order - b.order);
  const errors: Record<string, string> = {};
  const sanitized: Record<string, FormResponseValue> = {};

  for (const field of fields) {
    const error = validateFieldValue(field, responses[field.id]);
    if (error) {
      errors[field.id] = error;
      continue;
    }

    const value = responses[field.id];
    if (value !== undefined && value !== null && value !== '') {
      sanitized[field.id] = value;
    }
  }

  for (const key of Object.keys(responses)) {
    if (!fields.some((field) => field.id === key)) {
      errors[key] = 'Unknown field';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, sanitized };
}

export function isBuilderProfileCompleteForRegistration(builder: {
  name?: string | null;
  email?: string | null;
  headline?: string | null;
  availability?: { availableNow?: boolean } | null;
}): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!builder.name?.trim()) missing.push('name');
  if (!builder.email?.trim()) missing.push('email');
  if (!builder.headline?.trim()) missing.push('headline');
  if (builder.availability?.availableNow === undefined) missing.push('availability');
  return { complete: missing.length === 0, missing };
}

export function serializeEventRecord(doc: Record<string, unknown>, includeFormSchema = false) {
  const base = {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    date: doc.date ? new Date(doc.date as string).toISOString() : null,
    endDate: doc.endDate ? new Date(doc.endDate as string).toISOString() : null,
    type: doc.type,
    location: doc.location ?? null,
    description: doc.description ?? null,
    headerImageUrl: doc.headerImageUrl ?? null,
    websiteUrl: doc.websiteUrl ?? null,
    registrationStatus: doc.registrationStatus ?? 'draft',
    registrationOpensAt: doc.registrationOpensAt
      ? new Date(doc.registrationOpensAt as string).toISOString()
      : null,
    registrationClosesAt: doc.registrationClosesAt
      ? new Date(doc.registrationClosesAt as string).toISOString()
      : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt as string).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string).toISOString() : null,
  };

  if (includeFormSchema) {
    return {
      ...base,
      formSchema: doc.formSchema || { fields: [] },
    };
  }

  return base;
}
