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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookSecret = exports.stripe = void 0;
exports.getStripeOptions = getStripeOptions;
exports.getOrCreateCustomerForLocation = getOrCreateCustomerForLocation;
exports.clearStripeCache = clearStripeCache;
const stripe_1 = __importDefault(require("stripe"));
const environment_1 = require("./environment");
const database_1 = require("./database");
const logger_1 = require("../shared/utils/logger");
const config = (0, environment_1.validateEnvironment)();
exports.stripe = new stripe_1.default(config.stripe.secretKey);
exports.webhookSecret = config.stripe.webhookSecret;
// ---------------------------------------------------------------------------
// Stripe Connect helpers
// ---------------------------------------------------------------------------
/**
 * In-memory cache: locationId → connected account ID (or null for platform).
 * Cleared via clearStripeCache() when location settings change.
 */
const stripeAccountCache = new Map();
/**
 * Returns Stripe request options with `stripeAccount` set when the location
 * uses a Connect account. Returns `undefined` for the platform account
 * (current single-location behavior — Stripe SDK ignores undefined opts).
 */
function getStripeOptions(locationId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (stripeAccountCache.has(locationId)) {
            const cached = stripeAccountCache.get(locationId);
            return cached ? { stripeAccount: cached } : undefined;
        }
        const { data, error } = yield database_1.supabase
            .from('locations')
            .select('stripe_connected_account_id')
            .eq('id', locationId)
            .single();
        if (error) {
            logger_1.logger.error({ err: error, locationId }, 'Failed to look up Stripe account for location');
            // Do NOT cache on error — allow retry on next request
            return undefined;
        }
        const accountId = (_a = data === null || data === void 0 ? void 0 : data.stripe_connected_account_id) !== null && _a !== void 0 ? _a : null;
        stripeAccountCache.set(locationId, accountId);
        return accountId ? { stripeAccount: accountId } : undefined;
    });
}
/**
 * Get or create a Stripe Customer scoped to the correct account.
 *
 * - Platform account (stripeOpts undefined): uses existing user_profiles.stripe_customer_id
 * - Connected account: uses customer_stripe_accounts table, creates on the
 *   connected account if not found.
 */
function getOrCreateCustomerForLocation(userId, locationId, email, name) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const stripeOpts = yield getStripeOptions(locationId);
        // ------ Platform account (current behavior, unchanged) ------
        if (!stripeOpts) {
            const { data: profile } = yield database_1.supabase
                .from('user_profiles')
                .select('stripe_customer_id, email, full_name')
                .eq('id', userId)
                .single();
            let customerId = (_a = profile === null || profile === void 0 ? void 0 : profile.stripe_customer_id) !== null && _a !== void 0 ? _a : null;
            // Verify the stored customer still exists in Stripe
            if (customerId) {
                try {
                    yield exports.stripe.customers.retrieve(customerId);
                }
                catch (err) {
                    if (err.code === 'resource_missing') {
                        logger_1.logger.warn({ stripeCustomerId: customerId, userId }, 'Stored Stripe customer not found, creating new one');
                        customerId = null;
                    }
                    else {
                        throw err;
                    }
                }
            }
            if (!customerId) {
                const customerEmail = email || (profile === null || profile === void 0 ? void 0 : profile.email);
                const customerName = name || (profile === null || profile === void 0 ? void 0 : profile.full_name);
                if (!customerEmail) {
                    throw new Error('Cannot create Stripe customer — no email available');
                }
                const customer = yield exports.stripe.customers.create({
                    email: customerEmail,
                    name: customerName || undefined,
                    metadata: { user_id: userId },
                });
                customerId = customer.id;
                yield database_1.supabase
                    .from('user_profiles')
                    .update({ stripe_customer_id: customerId })
                    .eq('id', userId);
            }
            return { customerId, stripeOpts: undefined };
        }
        // ------ Connected account ------
        const connectedAccountId = stripeOpts.stripeAccount;
        const { data: existing } = yield database_1.supabase
            .from('customer_stripe_accounts')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .eq('stripe_account_id', connectedAccountId)
            .maybeSingle();
        if (existing === null || existing === void 0 ? void 0 : existing.stripe_customer_id) {
            return { customerId: existing.stripe_customer_id, stripeOpts };
        }
        // Need to create the customer on the connected account
        const { data: profile } = yield database_1.supabase
            .from('user_profiles')
            .select('email, full_name')
            .eq('id', userId)
            .single();
        const customerEmail = email || (profile === null || profile === void 0 ? void 0 : profile.email);
        if (!customerEmail) {
            throw new Error('Cannot create Stripe customer — no email available');
        }
        const customer = yield exports.stripe.customers.create({
            email: customerEmail,
            name: name || (profile === null || profile === void 0 ? void 0 : profile.full_name) || undefined,
            metadata: { user_id: userId },
        }, stripeOpts);
        yield database_1.supabase.from('customer_stripe_accounts').insert({
            user_id: userId,
            stripe_account_id: connectedAccountId,
            stripe_customer_id: customer.id,
        });
        return { customerId: customer.id, stripeOpts };
    });
}
/**
 * Invalidate the Stripe account cache for a location (or all locations).
 * Call this when location settings change.
 */
function clearStripeCache(locationId) {
    if (locationId) {
        stripeAccountCache.delete(locationId);
    }
    else {
        stripeAccountCache.clear();
    }
}
