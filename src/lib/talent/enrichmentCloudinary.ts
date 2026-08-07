import { v2 as cloudinary } from 'cloudinary';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

const ORG_PREFIX = 'devlabs/enrichment/organizations';
const AVATAR_PREFIX = 'devlabs/enrichment/avatars';

function configureCloudinary(runtime?: RuntimeEnv) {
  const cloud_name = readEnv('CLOUDINARY_CLOUD_NAME', runtime);
  const api_key = readEnv('CLOUDINARY_API_KEY', runtime);
  const api_secret = readEnv('CLOUDINARY_API_SECRET', runtime);
  if (!cloud_name || !api_key || !api_secret) return false;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return true;
}

export function hasCloudinaryConfig(runtime?: RuntimeEnv) {
  return Boolean(
    readEnv('CLOUDINARY_CLOUD_NAME', runtime) &&
      readEnv('CLOUDINARY_API_KEY', runtime) &&
      readEnv('CLOUDINARY_API_SECRET', runtime)
  );
}

/** Stable slug for Cloudinary public_ids (company or school). */
export function enrichmentOrgSlug(input: string | null | undefined): string | null {
  const raw = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  if (!raw) return null;

  const linkedIn = raw.match(/linkedin\.com\/(company|school)\/([^/?#]+)/i);
  if (linkedIn?.[2]) {
    return decodeURIComponent(linkedIn[2])
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || null;
  }

  return raw
    .replace(/&/g, ' and ')
    .replace(/\b(co\.?|company|inc\.?|incorporated|llc|ltd\.?|limited|corp\.?|corporation|plc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || null;
}

export function organizationLogoPublicId(params: {
  type: 'company' | 'school';
  slug: string;
}) {
  const slug = enrichmentOrgSlug(params.slug);
  if (!slug) throw new Error('organization slug required');
  return `${ORG_PREFIX}/${params.type}/${slug}/logo`;
}

export function linkedInAvatarPublicId(vanityOrUrl: string) {
  const vanity =
    vanityOrUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ||
    vanityOrUrl.replace(/^@+/, '').trim();
  const slug = decodeURIComponent(vanity)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) throw new Error('linkedin vanity required for avatar public_id');
  return `${AVATAR_PREFIX}/${slug}`;
}

async function existingSecureUrl(publicId: string): Promise<string | null> {
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: 'image' });
    return typeof resource?.secure_url === 'string' ? resource.secure_url : null;
  } catch (error: any) {
    if (error?.http_code === 404 || error?.error?.http_code === 404) return null;
    // Some Cloudinary accounts return 420/401 for missing — treat unknown as miss.
    const message = String(error?.message || error || '');
    if (/not found|resource not found/i.test(message)) return null;
    throw error;
  }
}

/**
 * Upload a remote image once under a stable public_id.
 * If the asset already exists, returns the existing Cloudinary URL (no re-upload).
 */
export async function ensureCloudinaryImageFromUrl(params: {
  publicId: string;
  sourceUrl: string;
  runtime?: RuntimeEnv;
  transformation?: Array<Record<string, unknown>>;
}): Promise<{ url: string; publicId: string; reused: boolean } | null> {
  const sourceUrl = String(params.sourceUrl || '').trim();
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  if (!configureCloudinary(params.runtime)) return null;

  const existing = await existingSecureUrl(params.publicId);
  if (existing) {
    return { url: existing, publicId: params.publicId, reused: true };
  }

  try {
    const uploaded = await cloudinary.uploader.upload(sourceUrl, {
      public_id: params.publicId,
      overwrite: false,
      invalidate: false,
      resource_type: 'image',
      unique_filename: false,
      use_filename: false,
      ...(params.transformation?.length ? { transformation: params.transformation } : {}),
    });
    const url = uploaded.secure_url || uploaded.url;
    if (!url) return null;
    return { url, publicId: params.publicId, reused: false };
  } catch (error: any) {
    // Race: another request uploaded the same public_id.
    const message = String(error?.message || error || '');
    if (/already exists|Resource already exists/i.test(message)) {
      const raced = await existingSecureUrl(params.publicId);
      if (raced) return { url: raced, publicId: params.publicId, reused: true };
    }
    console.warn('[enrichment-cloudinary] upload failed', params.publicId, message.slice(0, 200));
    return null;
  }
}

export async function ensureOrganizationLogo(params: {
  type: 'company' | 'school';
  nameOrUrl: string;
  sourceUrl: string;
  runtime?: RuntimeEnv;
}): Promise<string | null> {
  const slug = enrichmentOrgSlug(params.nameOrUrl);
  if (!slug) return null;
  const result = await ensureCloudinaryImageFromUrl({
    publicId: organizationLogoPublicId({ type: params.type, slug }),
    sourceUrl: params.sourceUrl,
    runtime: params.runtime,
  });
  return result?.url || null;
}

export async function ensureLinkedInAvatar(params: {
  vanityOrUrl: string;
  sourceUrl: string;
  runtime?: RuntimeEnv;
}): Promise<string | null> {
  let publicId: string;
  try {
    publicId = linkedInAvatarPublicId(params.vanityOrUrl);
  } catch {
    return null;
  }
  const result = await ensureCloudinaryImageFromUrl({
    publicId,
    sourceUrl: params.sourceUrl,
    runtime: params.runtime,
    transformation: [
      { width: 512, height: 512, crop: 'fill', gravity: 'face:auto' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });
  return result?.url || null;
}

export function isCloudinaryUrl(url?: string | null) {
  return /res\.cloudinary\.com/i.test(String(url || ''));
}
