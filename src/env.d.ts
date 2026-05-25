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

declare namespace NodeJS {
  interface ProcessEnv {
    /** Optional. Defaults to people@devlabs.club in momentumEmail.ts */
    SENDGRID_FROM_EMAIL?: string;
  }
}
