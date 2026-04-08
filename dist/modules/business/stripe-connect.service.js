"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeConnectService = exports.StripeConnectService = exports.StripeConnectError = void 0;
const stripe_1 = require("../../config/stripe");
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
class StripeConnectError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'StripeConnectError';
    }
}
exports.StripeConnectError = StripeConnectError;
function frontendUrl() {
    return process.env.FRONTEND_URL || 'https://app.golflabs.us';
}
function loadLocation(locationId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data, error } = yield database_1.supabase
            .from('locations')
            .select('id, client_id, stripe_connected_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted')
            .eq('id', locationId)
            .is('deleted_at', null)
            .single();
        if (error || !data) {
            throw new StripeConnectError('Location not found', 404);
        }
        return data;
    });
}
class StripeConnectService {
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
    getOrCreateAccount(locationId, ownerEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const location = yield loadLocation(locationId);
            if (location.stripe_connected_account_id) {
                return location.stripe_connected_account_id;
            }
            let account;
            try {
                account = yield stripe_1.stripe.accounts.create({
                    type: 'express',
                    email: ownerEmail,
                    capabilities: {
                        card_payments: { requested: true },
                        transfers: { requested: true },
                    },
                    metadata: {
                        location_id: locationId,
                        client_id: (_a = location.client_id) !== null && _a !== void 0 ? _a : '',
                    },
                });
            }
            catch (err) {
                logger_1.logger.error({ err, locationId }, 'Stripe accounts.create failed');
                throw new StripeConnectError('Failed to create Stripe account', 502);
            }
            // Conditional claim: only succeeds if no concurrent caller has already
            // populated the column. `.select().maybeSingle()` returns null when zero
            // rows matched the WHERE clause, which is how we detect "we lost".
            const { data: claimed, error: claimError } = yield database_1.supabase
                .from('locations')
                .update({ stripe_connected_account_id: account.id })
                .eq('id', locationId)
                .is('stripe_connected_account_id', null)
                .select('stripe_connected_account_id')
                .maybeSingle();
            if (claimError) {
                logger_1.logger.error({ err: claimError, locationId, accountId: account.id }, 'Created Stripe account but failed to persist id — manual reconciliation required');
                // Best-effort cleanup of the just-created account so it doesn't orphan.
                try {
                    yield stripe_1.stripe.accounts.del(account.id);
                }
                catch (delErr) {
                    logger_1.logger.warn({ err: delErr, accountId: account.id }, 'Failed to clean up orphaned Stripe account');
                }
                throw new StripeConnectError('Failed to persist Stripe account', 500);
            }
            if (!claimed) {
                // Lost the race. Delete our orphan and return whoever won.
                logger_1.logger.info({ locationId, orphanAccountId: account.id }, 'Concurrent Stripe account creation detected — discarding orphan');
                try {
                    yield stripe_1.stripe.accounts.del(account.id);
                }
                catch (delErr) {
                    logger_1.logger.warn({ err: delErr, accountId: account.id }, 'Failed to clean up orphaned Stripe account');
                }
                const winner = yield loadLocation(locationId);
                if (!winner.stripe_connected_account_id) {
                    // Should be impossible — we just lost the conditional UPDATE so the
                    // column must be non-null. Defensive guard for the type narrowing.
                    throw new StripeConnectError('Stripe account claim race state inconsistent', 500);
                }
                return winner.stripe_connected_account_id;
            }
            (0, stripe_1.clearStripeCache)(locationId);
            return account.id;
        });
    }
    /**
     * Mint a one-time hosted onboarding URL. The link expires after a few
     * minutes and can only be used once, so we generate a fresh one each time
     * the owner clicks "Continue onboarding".
     */
    createOnboardingLink(locationId, accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const base = frontendUrl();
            // Both URLs point at a tiny standalone callback page (`/stripe-connect/callback`)
            // rather than the full dashboard. This page detects whether it's running
            // inside a popup window and either postMessages the opener (popup mode,
            // the default for our flow) or falls back to redirecting the parent into
            // the dashboard with the legacy `?stripe_return=` query param.
            const callback = (result) => `${base}/stripe-connect/callback?locationId=${encodeURIComponent(locationId)}&result=${result}`;
            try {
                const link = yield stripe_1.stripe.accountLinks.create({
                    account: accountId,
                    type: 'account_onboarding',
                    refresh_url: callback('refresh'),
                    return_url: callback('return'),
                });
                return link.url;
            }
            catch (err) {
                logger_1.logger.error({ err, locationId, accountId }, 'Stripe accountLinks.create failed');
                throw new StripeConnectError('Failed to create onboarding link', 502);
            }
        });
    }
    /**
     * Mint a short-lived URL that drops the owner into the Stripe-hosted
     * Express dashboard for this account (payouts, balance, disputes).
     * Only valid for accounts whose onboarding has completed.
     */
    createDashboardLink(accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const link = yield stripe_1.stripe.accounts.createLoginLink(accountId);
                return link.url;
            }
            catch (err) {
                logger_1.logger.error({ err, accountId }, 'Stripe accounts.createLoginLink failed');
                throw new StripeConnectError('Stripe dashboard is only available after onboarding is complete', 409);
            }
        });
    }
    /**
     * Read cached capability flags from the locations row. Cheap — single
     * point read plus an indexed COUNT, no Stripe call. The capability cache
     * is refreshed by the `account.updated` webhook (and on demand via
     * `refreshStatus` below).
     */
    getStatus(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield loadLocation(locationId);
            // Count *other* locations sharing this account id. Uses the partial
            // index added in migration 062 — fast even on large location tables.
            let sharedWithSiblings = 0;
            if (row.stripe_connected_account_id) {
                const { count } = yield database_1.supabase
                    .from('locations')
                    .select('id', { count: 'exact', head: true })
                    .eq('stripe_connected_account_id', row.stripe_connected_account_id)
                    .neq('id', locationId)
                    .is('deleted_at', null);
                sharedWithSiblings = count !== null && count !== void 0 ? count : 0;
            }
            return {
                accountId: row.stripe_connected_account_id,
                chargesEnabled: row.stripe_charges_enabled,
                payoutsEnabled: row.stripe_payouts_enabled,
                detailsSubmitted: row.stripe_details_submitted,
                ready: Boolean(row.stripe_connected_account_id &&
                    row.stripe_charges_enabled &&
                    row.stripe_payouts_enabled),
                sharedWithSiblings,
            };
        });
    }
    /**
     * Pull the live account from Stripe and write the capability flags back
     * to the locations row. Called by the `account.updated` webhook handler
     * and by the controller's `refreshStatus` endpoint (used as a fallback
     * when the user returns from onboarding before the webhook lands).
     */
    syncAccountStatus(accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            let account;
            try {
                account = yield stripe_1.stripe.accounts.retrieve(accountId);
            }
            catch (err) {
                logger_1.logger.error({ err, accountId }, 'Stripe accounts.retrieve failed');
                throw new StripeConnectError('Failed to retrieve Stripe account', 502);
            }
            // Update every location row pointing at this account in one statement,
            // and return the affected ids so we can invalidate just those entries
            // in the in-memory cache (rather than nuking the cache for every tenant
            // on every Connect event).
            const { data: affected, error } = yield database_1.supabase
                .from('locations')
                .update({
                stripe_charges_enabled: (_a = account.charges_enabled) !== null && _a !== void 0 ? _a : false,
                stripe_payouts_enabled: (_b = account.payouts_enabled) !== null && _b !== void 0 ? _b : false,
                stripe_details_submitted: (_c = account.details_submitted) !== null && _c !== void 0 ? _c : false,
            })
                .eq('stripe_connected_account_id', accountId)
                .select('id');
            if (error) {
                logger_1.logger.error({ err: error, accountId }, 'Failed to persist Stripe account status');
                throw new StripeConnectError('Failed to persist account status', 500);
            }
            // Capability flags drive the payment-vs-platform routing decision in
            // getStripeOptions; invalidate exactly the affected location ids so the
            // next request reloads from DB. Empty array (no rows matched) is fine —
            // the account exists in Stripe but no location references it yet.
            affected === null || affected === void 0 ? void 0 : affected.forEach((row) => (0, stripe_1.clearStripeCache)(row.id));
        });
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
    disconnectLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield loadLocation(locationId);
            if (!row.stripe_connected_account_id) {
                // Idempotent: already disconnected.
                return this.getStatus(locationId);
            }
            const { error } = yield database_1.supabase
                .from('locations')
                .update({
                stripe_connected_account_id: null,
                stripe_charges_enabled: false,
                stripe_payouts_enabled: false,
                stripe_details_submitted: false,
            })
                .eq('id', locationId);
            if (error) {
                logger_1.logger.error({ err: error, locationId }, 'Failed to disconnect Stripe account from location');
                throw new StripeConnectError('Failed to disconnect Stripe account', 500);
            }
            (0, stripe_1.clearStripeCache)(locationId);
            return this.getStatus(locationId);
        });
    }
    /**
     * On-demand sync used by the controller after the user returns from
     * onboarding, in case the webhook hasn't landed yet. Resolves location →
     * accountId, then delegates to syncAccountStatus.
     */
    refreshStatusForLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield loadLocation(locationId);
            if (!row.stripe_connected_account_id) {
                return this.getStatus(locationId);
            }
            yield this.syncAccountStatus(row.stripe_connected_account_id);
            return this.getStatus(locationId);
        });
    }
}
exports.StripeConnectService = StripeConnectService;
exports.stripeConnectService = new StripeConnectService();
