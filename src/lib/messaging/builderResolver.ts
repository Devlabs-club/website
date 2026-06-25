import BuilderProfile from '@/models/talent/BuilderProfile';
import { normalizeHandle } from './types';

/**
 * Resolve an inbound iMessage handle (phone or email) to an existing enriched
 * BuilderProfile. Most builders already exist from scraping/enrichment, so the
 * claim flow is "confirm what we have", not "create from scratch".
 */
export type ResolveResult =
  | { status: 'matched'; builder: any }
  | { status: 'ambiguous'; builders: any[] }
  | { status: 'none' };

function lastTenDigits(handle: string): string | null {
  const digits = handle.replace(/[^\d]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function resolveBuilderByHandle(handle: string): Promise<ResolveResult> {
  const norm = normalizeHandle(handle);

  if (norm.includes('@')) {
    const byEmail = await BuilderProfile.find({ email: norm }).limit(5).lean();
    if (byEmail.length === 1) return { status: 'matched', builder: byEmail[0] };
    if (byEmail.length > 1) return { status: 'ambiguous', builders: byEmail };
    return { status: 'none' };
  }

  // phone: try exact, then last-10-digits (handles +1 vs raw, formatting drift)
  const exact = await BuilderProfile.find({ phone: norm }).limit(5).lean();
  if (exact.length === 1) return { status: 'matched', builder: exact[0] };
  if (exact.length > 1) return { status: 'ambiguous', builders: exact };

  const tail = lastTenDigits(norm);
  if (tail) {
    const fuzzy = await BuilderProfile.find({ phone: { $regex: `${tail}$` } })
      .limit(5)
      .lean();
    if (fuzzy.length === 1) return { status: 'matched', builder: fuzzy[0] };
    if (fuzzy.length > 1) return { status: 'ambiguous', builders: fuzzy };
  }

  return { status: 'none' };
}

/** Link a phone to a builder once they identify by email (or vice versa). */
export async function attachHandleToBuilder(builderId: string, handle: string) {
  const norm = normalizeHandle(handle);
  const field = norm.includes('@') ? 'email' : 'phone';
  await BuilderProfile.updateOne({ _id: builderId }, { $set: { [field]: norm } });
}
