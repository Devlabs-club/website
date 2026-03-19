/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly WORKOS_API_KEY: string;
  readonly WORKOS_CLIENT_ID: string;
  readonly WORKOS_CLIENT_SECRET: string;
  readonly WORKOS_COOKIE_PASSWORD: string;
  readonly WORKOS_REDIRECT_URI: string;
  readonly SENDGRID_API_KEY: string;
}
