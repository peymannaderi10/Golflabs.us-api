import Stripe from 'stripe';
import { stripe, clearStripeCache } from '../../config/stripe';
import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

/**
 * Stripe Connect onboarding service.
 *
 * Uses **Express** connected accounts: Stripe hosts both the onboarding flow
 * and the payouts dashboard, which removes the need for us to collect
 * compliance data, render Strong Customer Authentication forms, or implement
 * a payouts UI. The platform retains application-fee control and webhook
 * visibility into every connected charge.
 *
 * Lifecycle:
 *   1. Owner clicks "Connect Stripe" → `getOrCreateAccount` creates an
 *      Express account if none exists, persists `stripe_connected_account_id`
 *      on the location row, and returns the account id.
 *   2. We then mint a one-time `account_link` (type=account_onboarding) and
 *      redirect the owner to Stripe's hosted onboarding.
 *   3. Stripe redirects back to `return_url` after submission. We DO NOT
 *      trust the redirect itself — completion is confirmed by the
 *      `account.updated` webhook calling `syncAccountStatus`.
 *   4. To open the live dashboard later, we mint a one-time `login_link`.
 *
 * Cached capability flags (`stripe_charges_enabled`, etc.) live on
 * `locations` so the UI can render status without a Stripe round-trip on
 * every page load.
 */

export interface StripeConnectStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** True iff the location can accept live payments through Stripe Connect. */
  ready: boolean;
  /**
   * Number of *other* locations under the same account id. Drives the
   * disconnect-confirmation copy: a corporate chain disconnecting one of
   * many siblings is fundamentally different from a single-location tenant
   * orphaning their entire Connect account.
   */
  sharedWithSiblings: number;
}

interface LocationStripeRow {
  id: string;
  client_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
}

export class StripeConnectError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'StripeConnectError';
  }
}

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'https://app.golflabs.us';
}

async function loadLocation(locationId: string): Promise<LocationStripeRow> {
  const { data, error } = await supabase
    .from('locations')
    .select(
      'id, client_id, stripe_connected_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted'
    )
    .eq('id', locationId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    throw new StripeConnectError('Location not found', 404);
  }
  return data as LocationStripeRow;
}

export class StripeConnectService {
  /**
   * Look up or create the Express account for a location and return its id.
   *
   * Race-safe: concurrent callers (e.g. a double-clicked button or two open
   * tabs) both see NULL on the initial read, both call `accounts.create`,
   * and then *atomically* try to claim the row with a conditional UPDATE
   * (`WHERE stripe_connected_account_id IS NULL`). Only one wins — the
   * loser deletes its just-created Express account (which is always
   * deletable while onboarding is still pending) so we don't leak orphans
   * into the platform's Connect dashboard.
   */
  async getOrCreateAccount(locationId: string, ownerEmail: string): Promise<string> {
    const location = await loadLocation(locationId);
    if (location.stripe_connected_account_id) {
      return location.stripe_connected_account_id;
    }

    let account: Stripe.Account;
    try {
      account = await stripe.accounts.create({
        type: 'express',
        email: ownerEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          location_id: locationId,
          client_id: location.client_id ?? '',
        },
      });
    } catch (err) {
      logger.error({ err, locationId }, 'Stripe accounts.create failed');
      throw new StripeConnectError('Failed to create Stripe account', 502);
    }

    // Conditional claim: only succeeds if no concurrent caller has already
    // populated the column. `.select().maybeSingle()` returns null when zero
    // rows matched the WHERE clause, which is how we detect "we lost".
    const { data: claimed, error: claimError } = await supabase
      .from('locations')
      .update({ stripe_connected_account_id: account.id })
      .eq('id', locationId)
      .is('stripe_connected_account_id', null)
      .select('stripe_connected_account_id')
      .maybeSingle();

    if (claimError) {
      logger.error(
        { err: claimError, locationId, accountId: account.id },
        'Created Stripe account but failed to persist id — manual reconciliation required'
      );
      // Best-effort cleanup of the just-created account so it doesn't orphan.
      try {
        await stripe.accounts.del(account.id);
      } catch (delErr) {
        logger.warn({ err: delErr, accountId: account.id }, 'Failed to clean up orphaned Stripe account');
      }
      throw new StripeConnectError('Failed to persist Stripe account', 500);
    }

    if (!claimed) {
      // Lost the race. Delete our orphan and return whoever won.
      logger.info(
        { locationId, orphanAccountId: account.id },
        'Concurrent Stripe account creation detected — discarding orphan'
      );
      try {
        await stripe.accounts.del(account.id);
      } catch (delErr) {
        logger.warn({ err: delErr, accountId: account.id }, 'Failed to clean up orphaned Stripe account');
      }
      const winner = await loadLocation(locationId);
      if (!winner.stripe_connected_account_id) {
        // Should be impossible — we just lost the conditional UPDATE so the
        // column must be non-null. Defensive guard for the type narrowing.
        throw new StripeConnectError('Stripe account claim race state inconsistent', 500);
      }
      return winner.stripe_connected_account_id;
    }

    clearStripeCache(locationId);
    return account.id;
  }

  /**
   * Mint a one-time hosted onboarding URL. The link expires after a few
   * minutes and can only be used once, so we generate a fresh one each time
   * the owner clicks "Continue onboarding".
   */
  async createOnboardingLink(locationId: string, accountId: string): Promise<string> {
    const base = frontendUrl();
    try {
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        // refresh_url is hit if the link expired before the user clicked it.
        refresh_url: `${base}/dashboard/settings?stripe_refresh=${locationId}`,
        return_url: `${base}/dashboard/settings?stripe_return=${locationId}`,
      });
      return link.url;
    } catch (err) {
      logger.error({ err, locationId, accountId }, 'Stripe accountLinks.create failed');
      throw new StripeConnectError('Failed to create onboarding link', 502);
    }
  }

  /**
   * Mint a short-lived URL that drops the owner into the Stripe-hosted
   * Express dashboard for this account (payouts, balance, disputes).
   * Only valid for accounts whose onboarding has completed.
   */
  async createDashboardLink(accountId: string): Promise<string> {
    try {
      const link = await stripe.accounts.createLoginLink(accountId);
      return link.url;
    } catch (err) {
      logger.error({ err, accountId }, 'Stripe accounts.createLoginLink failed');
      throw new StripeConnectError(
        'Stripe dashboard is only available after onboarding is complete',
        409
      );
    }
  }

  /**
   * Read cached capability flags from the locations row. Cheap — single
   * point read plus an indexed COUNT, no Stripe call. The capability cache
   * is refreshed by the `account.updated` webhook (and on demand via
   * `refreshStatus` below).
   */
  async getStatus(locationId: string): Promise<StripeConnectStatus> {
    const row = await loadLocation(locationId);

    // Count *other* locations sharing this account id. Uses the partial
    // index added in migration 062 — fast even on large location tables.
    let sharedWithSiblings = 0;
    if (row.stripe_connected_account_id) {
      const { count } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('stripe_connected_account_id', row.stripe_connected_account_id)
        .neq('id', locationId)
        .is('deleted_at', null);
      sharedWithSiblings = count ?? 0;
    }

    return {
      accountId: row.stripe_connected_account_id,
      chargesEnabled: row.stripe_charges_enabled,
      payoutsEnabled: row.stripe_payouts_enabled,
      detailsSubmitted: row.stripe_details_submitted,
      ready: Boolean(
        row.stripe_connected_account_id &&
          row.stripe_charges_enabled &&
          row.stripe_payouts_enabled
      ),
      sharedWithSiblings,
    };
  }

  /**
   * Pull the live account from Stripe and write the capability flags back
   * to the locations row. Called by the `account.updated` webhook handler
   * and by the controller's `refreshStatus` endpoint (used as a fallback
   * when the user returns from onboarding before the webhook lands).
   */
  async syncAccountStatus(accountId: string): Promise<void> {
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch (err) {
      logger.error({ err, accountId }, 'Stripe accounts.retrieve failed');
      throw new StripeConnectError('Failed to retrieve Stripe account', 502);
    }

    // Update every location row pointing at this account in one statement,
    // and return the affected ids so we can invalidate just those entries
    // in the in-memory cache (rather than nuking the cache for every tenant
    // on every Connect event).
    const { data: affected, error } = await supabase
      .from('locations')
      .update({
        stripe_charges_enabled: account.charges_enabled ?? false,
        stripe_payouts_enabled: account.payouts_enabled ?? false,
        stripe_details_submitted: account.details_submitted ?? false,
      })
      .eq('stripe_connected_account_id', accountId)
      .select('id');

    if (error) {
      logger.error({ err: error, accountId }, 'Failed to persist Stripe account status');
      throw new StripeConnectError('Failed to persist account status', 500);
    }

    // Capability flags drive the payment-vs-platform routing decision in
    // getStripeOptions; invalidate exactly the affected location ids so the
    // next request reloads from DB. Empty array (no rows matched) is fine —
    // the account exists in Stripe but no location references it yet.
    affected?.forEach((row) => clearStripeCache(row.id));
  }

  /**
   * Detach this location from its current Stripe Connect account so the
   * owner can run fresh onboarding for a *different* account on this
   * location. Used by franchisees who share a brand with corporate but
   * file taxes under their own LLC.
   *
   * Important: we ONLY null this location's row. We do NOT call
   * `stripe.accounts.delete` — sibling locations may still be using the
   * account, and even if they aren't, the historical charges, customers,
   * and payouts on the connected account need to remain intact for tax
   * and reconciliation purposes. The orphaned account simply stops
   * receiving new charges from this location.
   */
  async disconnectLocation(locationId: string): Promise<StripeConnectStatus> {
    const row = await loadLocation(locationId);
    if (!row.stripe_connected_account_id) {
      // Idempotent: already disconnected.
      return this.getStatus(locationId);
    }

    const { error } = await supabase
      .from('locations')
      .update({
        stripe_connected_account_id: null,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
      })
      .eq('id', locationId);

    if (error) {
      logger.error({ err: error, locationId }, 'Failed to disconnect Stripe account from location');
      throw new StripeConnectError('Failed to disconnect Stripe account', 500);
    }

    clearStripeCache(locationId);
    return this.getStatus(locationId);
  }

  /**
   * On-demand sync used by the controller after the user returns from
   * onboarding, in case the webhook hasn't landed yet. Resolves location →
   * accountId, then delegates to syncAccountStatus.
   */
  async refreshStatusForLocation(locationId: string): Promise<StripeConnectStatus> {
    const row = await loadLocation(locationId);
    if (!row.stripe_connected_account_id) {
      return this.getStatus(locationId);
    }
    await this.syncAccountStatus(row.stripe_connected_account_id);
    return this.getStatus(locationId);
  }
}

export const stripeConnectService = new StripeConnectService();
