import Stripe from 'stripe';
import { validateEnvironment } from './environment';
import { supabase } from './database';
import { logger } from '../shared/utils/logger';

const config = validateEnvironment();

export const stripe = new Stripe(config.stripe.secretKey);
export const webhookSecret = config.stripe.webhookSecret;
export const connectWebhookSecret = config.stripe.connectWebhookSecret;

// ---------------------------------------------------------------------------
// Stripe Connect helpers
// ---------------------------------------------------------------------------

/**
 * In-memory cache: locationId → connected account ID (or null for platform).
 * Cleared via clearStripeCache() when location settings change.
 */
const stripeAccountCache = new Map<string, string | null>();

/**
 * Returns Stripe request options with `stripeAccount` set when the location
 * uses a Connect account. Returns `undefined` for the platform account
 * (current single-location behavior — Stripe SDK ignores undefined opts).
 */
export async function getStripeOptions(
  locationId: string
): Promise<Stripe.RequestOptions | undefined> {
  if (stripeAccountCache.has(locationId)) {
    const cached = stripeAccountCache.get(locationId)!;
    return cached ? { stripeAccount: cached } : undefined;
  }

  const { data, error } = await supabase
    .from('locations')
    .select('stripe_connected_account_id')
    .eq('id', locationId)
    .single();

  if (error) {
    logger.error({ err: error, locationId }, 'Failed to look up Stripe account for location');
    // Do NOT cache on error — allow retry on next request
    return undefined;
  }

  const accountId: string | null = data?.stripe_connected_account_id ?? null;
  stripeAccountCache.set(locationId, accountId);
  return accountId ? { stripeAccount: accountId } : undefined;
}

/**
 * Get or create a Stripe Customer scoped to the correct account.
 *
 * - Platform account (stripeOpts undefined): uses existing user_profiles.stripe_customer_id
 * - Connected account: uses customer_stripe_accounts table, creates on the
 *   connected account if not found.
 */
export async function getOrCreateCustomerForLocation(
  userId: string,
  locationId: string,
  email?: string,
  name?: string
): Promise<{ customerId: string; stripeOpts: Stripe.RequestOptions | undefined }> {
  const stripeOpts = await getStripeOptions(locationId);

  // ------ Platform account (current behavior, unchanged) ------
  if (!stripeOpts) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', userId)
      .single();

    let customerId = profile?.stripe_customer_id ?? null;

    // Verify the stored customer still exists in Stripe
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (err: any) {
        if (err.code === 'resource_missing') {
          logger.warn({ stripeCustomerId: customerId, userId }, 'Stored Stripe customer not found, creating new one');
          customerId = null;
        } else {
          throw err;
        }
      }
    }

    if (!customerId) {
      const customerEmail = email || profile?.email;
      const customerName = name || profile?.full_name;
      if (!customerEmail) {
        throw new Error('Cannot create Stripe customer — no email available');
      }
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName || undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;

      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    return { customerId, stripeOpts: undefined };
  }

  // ------ Connected account ------
  // `stripeOpts` is non-null here (the `if (!stripeOpts)` branch above
  // returned), and `getStripeOptions` only returns an object when
  // `stripeAccount` is set. Narrow explicitly instead of `!` so a future
  // refactor can't quietly produce undefined.
  const connectedAccountId = stripeOpts.stripeAccount;
  if (!connectedAccountId) {
    throw new Error('Internal error: connected account id missing on stripeOpts');
  }

  const { data: existing } = await supabase
    .from('customer_stripe_accounts')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .eq('stripe_account_id', connectedAccountId)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return { customerId: existing.stripe_customer_id, stripeOpts };
  }

  // Need to create the customer on the connected account
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  const customerEmail = email || profile?.email;
  if (!customerEmail) {
    throw new Error('Cannot create Stripe customer — no email available');
  }

  const customer = await stripe.customers.create(
    {
      email: customerEmail,
      name: name || profile?.full_name || undefined,
      metadata: { user_id: userId },
    },
    stripeOpts
  );

  await supabase.from('customer_stripe_accounts').insert({
    user_id: userId,
    stripe_account_id: connectedAccountId,
    stripe_customer_id: customer.id,
  });

  return { customerId: customer.id, stripeOpts };
}

/**
 * Invalidate the Stripe account cache for a location (or all locations).
 * Call this when location settings change.
 */
export function clearStripeCache(locationId?: string): void {
  if (locationId) {
    stripeAccountCache.delete(locationId);
  } else {
    stripeAccountCache.clear();
  }
}