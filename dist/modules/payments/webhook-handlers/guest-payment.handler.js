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
exports.handleGuestPaymentSucceeded = handleGuestPaymentSucceeded;
const database_1 = require("../../../config/database");
const email_service_1 = require("../../email/email.service");
const logger_1 = require("../../../shared/utils/logger");
/**
 * Guest checkout: finalize a successful payment.
 *
 * The booking row is always pre-created before this fires:
 *   - Reservation-hold mode: inserted in createGuestCheckoutSession
 *   - No-hold mode: inserted in handleAmountCapturableUpdated (capture time)
 *
 * Either way the row has status='reserved' and payment_intent_id set. This
 * handler flips it to 'confirmed', writes the payment + agreement rows,
 * sends the confirmation email, and marks the funnel attempt as converted.
 *
 * Idempotent via status guard — webhook retries are a no-op after the
 * first successful confirm.
 */
function handleGuestPaymentSucceeded(paymentIntent, socketService) {
    return __awaiter(this, void 0, void 0, function* () {
        const m = paymentIntent.metadata;
        const locationId = m.location_id;
        const spaceId = m.space_id;
        const guestEmail = m.guest_email ? m.guest_email.toLowerCase() : m.guest_email;
        const guestName = m.guest_name || null;
        const ipAddress = m.ip_address || null;
        const userAgent = m.user_agent || null;
        if (!locationId || !spaceId || !guestEmail) {
            logger_1.logger.error({ paymentIntentId: paymentIntent.id }, 'Guest PI succeeded but metadata incomplete');
            return;
        }
        // Look up the pre-created booking row by PI id.
        const { data: booking, error: fetchError } = yield database_1.supabase
            .from('bookings')
            .select('id, status')
            .eq('payment_intent_id', paymentIntent.id)
            .maybeSingle();
        if (fetchError || !booking) {
            logger_1.logger.error({ err: fetchError, paymentIntentId: paymentIntent.id }, 'Guest booking row not found at succeeded — cannot finalize');
            return;
        }
        if (booking.status === 'confirmed') {
            // Webhook retry or parallel delivery. Re-emit the socket event in case
            // a reconnecting client missed the first one, then exit.
            socketService.emitPaymentStatus(paymentIntent.id, 'succeeded', { bookingId: booking.id });
            return;
        }
        const bookingId = booking.id;
        // Attribute to an existing user if this email already has an account.
        let attributedUserId = null;
        const { data: existingProfile } = yield database_1.supabase
            .from('user_profiles')
            .select('id')
            .eq('email', guestEmail)
            .is('deleted_at', null)
            .maybeSingle();
        if (existingProfile) {
            attributedUserId = existingProfile.id;
        }
        // Flip reservation → confirmed. Status guard guarantees idempotency
        // even if two webhook deliveries race.
        const { error: updateError } = yield database_1.supabase
            .from('bookings')
            .update({
            status: 'confirmed',
            expires_at: null,
            user_id: attributedUserId,
            notes: 'Guest booking',
        })
            .eq('id', bookingId)
            .in('status', ['reserved', 'pending']);
        if (updateError) {
            logger_1.logger.error({ err: updateError, bookingId, paymentIntentId: paymentIntent.id }, 'Failed to confirm guest booking');
            return;
        }
        yield database_1.supabase.from('payments').insert({
            booking_id: bookingId,
            amount: paymentIntent.amount / 100,
            status: 'succeeded',
            stripe_payment_intent_id: paymentIntent.id,
            currency: 'usd',
            user_id: attributedUserId,
            location_id: locationId,
            processed_at: new Date().toISOString(),
        });
        // Legal agreements using the hashes captured at form-submission time
        const agreementTypes = [
            'terms_of_service',
            'privacy_policy',
            'liability_waiver',
            'damage_fees_acknowledgment',
        ];
        const now = new Date().toISOString();
        const agreementRows = agreementTypes
            .map((type) => ({ type, hash: m[`doc_hash_${type}`] }))
            .filter(({ hash }) => !!hash)
            .map(({ type, hash }) => ({
            user_id: attributedUserId,
            signer_name: guestName || 'Guest',
            signer_email: guestEmail,
            booking_id: bookingId,
            location_id: locationId,
            agreement_type: type,
            agreement_version: '1.0',
            document_hash: hash,
            accepted_at: now,
            ip_address: ipAddress,
            user_agent: userAgent,
        }));
        if (agreementRows.length > 0) {
            const { error: agreementErr } = yield database_1.supabase.from('user_agreements').insert(agreementRows);
            if (agreementErr) {
                logger_1.logger.error({ err: agreementErr, bookingId }, 'Failed to record guest agreements');
            }
        }
        try {
            yield email_service_1.EmailService.sendThankYouEmail(bookingId);
        }
        catch (emailErr) {
            logger_1.logger.error({ err: emailErr, bookingId }, 'Failed to send guest confirmation email');
        }
        try {
            yield socketService.triggerBookingUpdate(locationId, spaceId, bookingId);
        }
        catch (socketErr) {
            logger_1.logger.error({ err: socketErr, bookingId }, 'Failed to notify kiosk of guest booking');
        }
        socketService.emitPaymentStatus(paymentIntent.id, 'succeeded', { bookingId });
        const { error: fnlErr } = yield database_1.supabase
            .from('guest_checkout_attempts')
            .update({
            status: 'converted',
            booking_id: bookingId,
            converted_at: new Date().toISOString(),
        })
            .eq('stripe_payment_intent_id', paymentIntent.id)
            .eq('status', 'pending');
        if (fnlErr)
            logger_1.logger.warn({ err: fnlErr, paymentIntentId: paymentIntent.id }, 'Failed to mark guest_checkout_attempt converted');
        logger_1.logger.info({ bookingId, paymentIntentId: paymentIntent.id }, 'Guest booking confirmed from payment success');
    });
}
