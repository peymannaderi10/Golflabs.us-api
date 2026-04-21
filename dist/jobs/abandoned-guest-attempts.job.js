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
exports.markAbandonedGuestAttempts = markAbandonedGuestAttempts;
const database_1 = require("../config/database");
const logger_1 = require("../shared/utils/logger");
/**
 * Mark stale pending guest_checkout_attempts rows as 'abandoned'.
 *
 * A row is "stale" when the guest submitted the form, we created the Stripe
 * PaymentIntent, but the customer never completed (or cancelled) payment.
 * Webhooks for payment_intent.canceled / payment_failed update the row
 * directly, so anything still 'pending' after the threshold means the user
 * simply walked away (closed tab, ran out of battery, etc.).
 *
 * The threshold is intentionally long (24h). Stripe PIs auto-expire after
 * 7 days for most card types, so we won't leak real auth holds, and giving
 * abandoned carts a full day before marking them captures more analytic
 * value (a late-evening abandonment that converts the next morning should
 * still be counted as a single converted session, not abandon-then-new).
 */
const ABANDON_AFTER_HOURS = 24;
function markAbandonedGuestAttempts() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 60 * 60 * 1000).toISOString();
            const { error, count } = yield database_1.supabase
                .from('guest_checkout_attempts')
                .update({
                status: 'abandoned',
                outcome_reason: 'cron_stale',
                terminated_at: new Date().toISOString(),
            }, { count: 'exact' })
                .eq('status', 'pending')
                .lt('created_at', cutoff);
            if (error) {
                logger_1.logger.error({ err: error }, 'Failed to mark abandoned guest attempts');
                return;
            }
            if (count && count > 0) {
                logger_1.logger.info({ count }, 'Marked guest_checkout_attempts as abandoned');
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error }, 'Unexpected error in markAbandonedGuestAttempts');
        }
    });
}
