export type LinkedInSessionConfig = {
  liAt: string;
  jsessionId: string;
  bcookie?: string;
  bscookie?: string;
  /** Additional cookies (e.g. __cf_bm, liap, lidc) merged into the request header. */
  extras?: Record<string, string>;
  rawCookieHeader?: string;
};
