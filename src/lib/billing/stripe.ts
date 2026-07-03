import Stripe from 'stripe';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export function getStripe(runtime?: RuntimeEnv) {
  const secretKey =
    readEnv('STRIPE_SECRET_KEY', runtime) ||
    readEnv('STRIPE_AGENT_SECRET_KEY', runtime) ||
    readEnv('STRIPE_PROD_KEY', runtime);
  if (!secretKey) return null;
  return new Stripe(secretKey, {
    apiVersion: '2025-06-30.basil',
  });
}

export function getStripeConfig(runtime?: RuntimeEnv) {
  return {
    growthMonthlyPriceId: readEnv('STRIPE_GROWTH_MONTHLY_PRICE_ID', runtime),
    growthYearlyPriceId: readEnv('STRIPE_GROWTH_YEARLY_PRICE_ID', runtime),
    customDepositPriceId: readEnv('STRIPE_CUSTOM_DEPOSIT_PRICE_ID', runtime),
    webhookSecret: readEnv('STRIPE_WEBHOOK_SECRET', runtime),
  };
}

export function requireStripe(runtime?: RuntimeEnv) {
  const stripe = getStripe(runtime);
  if (!stripe) throw new Error('Stripe secret key is not configured');
  return stripe;
}

export function siteOrigin(request: Request, runtime?: RuntimeEnv) {
  const configured = readEnv('WEBSITE_ROOT', runtime) || readEnv('PUBLIC_URL', runtime);
  if (configured) return configured.replace(/\/$/, '');
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
