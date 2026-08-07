/**
 * Shared post-login / post-OAuth destination rules.
 * Role chooser is only for unscoped accounts. Claim links always win.
 */

export type AuthDestinationUser = {
  accountType?: string | null;
  role?: string | null;
};

export type AccountKind = 'founder' | 'builder' | 'admin' | 'unscoped';

export function resolveAccountKind(user: AuthDestinationUser): AccountKind {
  if (user.role === 'admin') return 'admin';
  if (user.accountType === 'founder' || user.role === 'founder') return 'founder';
  if (user.accountType === 'builder' || user.role === 'builder') return 'builder';
  return 'unscoped';
}

function safeRelativePath(redirect?: string | null): string | null {
  if (!redirect) return null;
  const trimmed = redirect.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

/** If path is /auth/select-role?redirect=..., return the nested redirect. */
export function nestedSelectRoleRedirect(path: string): string | null {
  if (!path.startsWith('/auth/select-role')) return null;
  try {
    const url = new URL(path, 'https://devlabs.local');
    return safeRelativePath(url.searchParams.get('redirect'));
  } catch {
    return null;
  }
}

/**
 * Where to send the user after login/signup/OAuth.
 * - Founders/builders never land on /auth/select-role just to bounce.
 * - Founder claim links skip role selection entirely (claim assigns founder).
 * - Unscoped users only see select-role when they still need to pick.
 */
export function resolvePostAuthDestination(
  user: AuthDestinationUser,
  redirect?: string | null
): string {
  const kind = resolveAccountKind(user);
  let target = safeRelativePath(redirect);

  // Unwrap accidental select-role wrappers so assigned users don't bounce there.
  if (target?.startsWith('/auth/select-role')) {
    const nested = nestedSelectRoleRedirect(target);
    if (nested) target = nested;
    else if (kind === 'founder' || kind === 'admin') return '/founder/home';
    else if (kind === 'builder') return '/builder/home';
    else return '/auth/select-role';
  }

  // Claim links: any authenticated user (including brand-new) goes straight through.
  if (target?.startsWith('/founder/claim/')) {
    return target;
  }

  if (kind === 'admin') {
    if (target?.startsWith('/admin')) return target;
    if (target?.startsWith('/founder/')) return target;
    return '/admin';
  }

  if (kind === 'founder') {
    if (target?.startsWith('/founder/')) return target;
    return '/founder/home';
  }

  if (kind === 'builder') {
    if (target?.startsWith('/builder/')) return target;
    return '/builder/home';
  }

  // Unscoped — only show role chooser when needed.
  if (!target || target === '/dashboard') {
    return '/auth/select-role';
  }

  // Deep link into founder/builder without a role yet → pick role, then continue.
  if (target.startsWith('/founder/') || target.startsWith('/builder/')) {
    return `/auth/select-role?redirect=${encodeURIComponent(target)}`;
  }

  return target;
}
