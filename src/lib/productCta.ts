export const FOUNDER_HOME_PATH = "/founder/home";

/** Signup flow that lands founders on the free product demo. */
export function founderAuthSignupHref(target = FOUNDER_HOME_PATH) {
  return `/auth/signup?redirect=${encodeURIComponent(`/auth/select-role?redirect=${encodeURIComponent(target)}`)}`;
}

export const tryForFreeHref = founderAuthSignupHref();
