/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly JWT_SECRET?: string;
  readonly WORKOS_API_KEY: string;
  readonly WORKOS_CLIENT_ID: string;
  readonly WORKOS_CLIENT_SECRET: string;
  readonly WORKOS_COOKIE_PASSWORD: string;
  readonly WORKOS_REDIRECT_URI: string;
  readonly WEBSITE_ROOT?: string;
  readonly VERCEL_BRANCH_URL?: string;
  readonly SENDGRID_API_KEY: string;
}

declare namespace App {
  interface Locals {
    runtime?: {
      env?: Record<string, string | undefined> & {
        API_PROXY_ORIGIN?: string;
      };
    };
  }
}

declare namespace NodeJS {
  interface ProcessEnv {
    JWT_SECRET?: string;
    /** Optional. Defaults to people@devlabs.club in momentumEmail.ts */
    SENDGRID_FROM_EMAIL?: string;
    WORKOS_API_KEY?: string;
    WORKOS_CLIENT_ID?: string;
    WORKOS_CLIENT_SECRET?: string;
    WORKOS_COOKIE_PASSWORD?: string;
    WORKOS_REDIRECT_URI?: string;
    WEBSITE_ROOT?: string;
  }
}
