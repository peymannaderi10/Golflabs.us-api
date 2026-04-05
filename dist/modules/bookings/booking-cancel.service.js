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
exports.BookingCancelService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const email_service_1 = require("../email/email.service");
const notification_service_1 = require("../email/notification.service");
const logger_1 = require("../../shared/utils/logger");
class BookingCancelService {
    cancelBooking(bookingId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (!bookingId || !userId) {
                throw new Error('Booking ID and User ID are required');
            }
            // 1. Get the booking details
            const { data: booking, error: fetchError } = yield database_1.supabase
                .from('bookings')
                .select('id, user_id, start_time, status, total_amount, location_id, space_id')
                .eq('id', bookingId)
                .eq('user_id', userId)
                .single();
            if (fetchError || !booking) {
                throw new Error('Booking not found or access denied');
            }
            // 2. Check if booking can be cancelled
            if (booking.status === 'cancelled') {
                throw new Error('Booking is already cancelled');
            }
            if (booking.status !== 'confirmed') {
                throw new Error('Only confirmed bookings can be cancelled');
            }
            // 3. Resolve Stripe Connect options
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(booking.location_id);
            // 4. Check cancellation policy (configurable per location)
            const { data: settings } = yield database_1.supabase
                .from('location_settings')
                .select('cancellation_policy_hours')
                .eq('location_id', booking.location_id)
                .single();
            const policyHours = (_a = settings === null || settings === void 0 ? void 0 : settings.cancellation_policy_hours) !== null && _a !== void 0 ? _a : 24;
            const bookingStartTime = new Date(booking.start_time);
            const now = new Date();
            const hoursDifference = (bookingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursDifference < policyHours) {
                throw new Error(`Bookings cannot be cancelled within ${policyHours} hours of the start time. Hours remaining: ${Math.round(hoursDifference * 10) / 10}`);
            }
            // 4. Get ALL successful payment records (original + extensions) to process refunds
            const { data: payments, error: paymentError } = yield database_1.supabase
                .from('payments')
                .select('stripe_payment_intent_id, amount, status, metadata')
                .eq('booking_id', bookingId)
                .eq('status', 'succeeded');
            if (paymentError) {
                logger_1.logger.warn({ err: paymentError, bookingId }, 'Could not query payments for booking, cancelling without refund');
            }
            // 5. Process Stripe refund for each payment (skip SetupIntents — $0 bookings have no charge)
            const refundIds = [];
            for (const payment of (payments || [])) {
                if (!payment.stripe_payment_intent_id || payment.stripe_payment_intent_id.startsWith('seti_'))
                    continue;
                try {
                    const refund = yield stripe_1.stripe.refunds.create({
                        payment_intent: payment.stripe_payment_intent_id,
                        reason: 'requested_by_customer',
                        metadata: {
                            booking_id: bookingId,
                            user_id: userId,
                            cancelled_at: new Date().toISOString()
                        }
                    }, stripeOpts);
                    refundIds.push(refund.id);
                    logger_1.logger.info({ bookingId, refundId: refund.id, amount: payment.amount }, 'Refund created for payment');
                    // Update this payment record
                    yield database_1.supabase
                        .from('payments')
                        .update({
                        status: 'refunded',
                        refund_amount: payment.amount,
                        refunded_at: new Date().toISOString()
                    })
                        .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);
                }
                catch (stripeError) {
                    logger_1.logger.error({ err: stripeError, bookingId, piId: payment.stripe_payment_intent_id }, 'Error creating refund');
                    throw new Error(`Failed to process refund. Please contact support. Details: ${stripeError.message}`);
                }
            }
            // 6. Update booking status to cancelled and immediately expire it
            const { error: updateBookingError } = yield database_1.supabase
                .from('bookings')
                .update({
                status: 'cancelled',
                expires_at: new Date().toISOString()
            })
                .eq('id', bookingId);
            if (updateBookingError) {
                logger_1.logger.error({ err: updateBookingError, bookingId }, 'Error updating booking to cancelled');
                throw updateBookingError;
            }
            logger_1.logger.info({ bookingId }, 'Booking cancelled and time slot freed for new reservations');
            // 7. Create cancellation record
            const totalRefundAmount = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
            const { error: cancellationError } = yield database_1.supabase
                .from('booking_cancellations')
                .insert({
                booking_id: bookingId,
                cancelled_by: userId,
                cancellation_reason: 'Customer requested cancellation',
                cancellation_fee: 0,
                refund_amount: totalRefundAmount,
                cancelled_at: new Date().toISOString()
            });
            if (cancellationError) {
                logger_1.logger.error({ err: cancellationError, bookingId }, 'Error creating cancellation record for booking');
            }
            // 8. Restore membership free minutes if any were used for this booking
            for (const payment of (payments || [])) {
                try {
                    let restoreMembershipId = null;
                    let restoreFreeMinutes = 0;
                    // Try Stripe metadata first (paid bookings)
                    if (payment.stripe_payment_intent_id) {
                        const stripeId = payment.stripe_payment_intent_id;
                        const stripeObj = stripeId.startsWith('seti_')
                            ? yield stripe_1.stripe.setupIntents.retrieve(stripeId, stripeOpts)
                            : yield stripe_1.stripe.paymentIntents.retrieve(stripeId, stripeOpts);
                        restoreMembershipId = ((_b = stripeObj.metadata) === null || _b === void 0 ? void 0 : _b.membership_id) || null;
                        restoreFreeMinutes = parseFloat(((_c = stripeObj.metadata) === null || _c === void 0 ? void 0 : _c.member_free_minutes_applied) || '0');
                    }
                    // Fallback to local payment metadata ($0 extensions / free bookings)
                    if (!restoreMembershipId && payment.metadata) {
                        const meta = payment.metadata;
                        restoreMembershipId = meta.membership_id || null;
                        restoreFreeMinutes = parseFloat(meta.member_free_minutes_applied || '0');
                    }
                    if (restoreMembershipId && restoreFreeMinutes > 0) {
                        yield database_1.supabase.rpc('increment_free_minutes_used', {
                            p_membership_id: restoreMembershipId,
                            p_delta: -restoreFreeMinutes,
                        });
                        logger_1.logger.info({ membershipId: restoreMembershipId, freeMinutesApplied: restoreFreeMinutes, bookingId }, 'Restored free minutes after booking cancellation');
                    }
                }
                catch (memberErr) {
                    logger_1.logger.error({ err: memberErr, bookingId }, 'Error restoring membership free minutes on cancellation');
                }
            }
            // 9. Delete any pending reminder notification so it doesn't fire after cancellation
            yield notification_service_1.NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');
            // 10. Send cancellation email notification
            try {
                yield email_service_1.EmailService.sendCancellationEmail(bookingId, 'Customer requested cancellation', 'customer', totalRefundAmount > 0 ? totalRefundAmount : undefined, refundIds.length > 0);
            }
            catch (emailError) {
                logger_1.logger.error({ err: emailError, bookingId }, 'Error sending cancellation email for booking');
                // Don't fail the request since booking was already cancelled successfully
            }
            return {
                success: true,
                bookingId,
                refundIds,
                locationId: booking.location_id,
                spaceId: booking.space_id,
                message: refundIds.length > 0 ? 'Booking cancelled and refund processed' : 'Booking cancelled'
            };
        });
    }
    employeeCancelBooking(bookingId_1, employeeId_1, reason_1) {
        return __awaiter(this, arguments, void 0, function* (bookingId, employeeId, reason, skipRefund = false) {
            if (!bookingId || !employeeId) {
                throw new Error('Booking ID and Employee ID are required');
            }
            // 1. Call the database function for atomic cancellation
            const { error: rpcError } = yield database_1.supabase.rpc('cancel_booking_by_employee', {
                p_booking_id: bookingId,
                p_employee_user_id: employeeId,
                p_cancellation_reason: reason || 'Cancelled by staff'
            });
            if (rpcError) {
                logger_1.logger.error({ err: rpcError, bookingId }, 'Error cancelling booking in database');
                throw new Error('Database cancellation failed: ' + rpcError.message);
            }
            // 2. Get booking location for Stripe Connect options
            const { data: empBooking } = yield database_1.supabase
                .from('bookings')
                .select('location_id')
                .eq('id', bookingId)
                .single();
            const empStripeOpts = empBooking ? yield (0, stripe_1.getStripeOptions)(empBooking.location_id) : undefined;
            // 3. Process refunds unless skipRefund is true
            const refundIds = [];
            if (!skipRefund) {
                // Get ALL successful payment records (original + extensions) to process refunds
                const { data: payments, error: paymentError } = yield database_1.supabase
                    .from('payments')
                    .select('stripe_payment_intent_id, amount')
                    .eq('booking_id', bookingId)
                    .eq('status', 'succeeded');
                if (paymentError) {
                    logger_1.logger.warn({ err: paymentError, bookingId }, 'Could not query payments for booking, cancelling without refund');
                }
                // 4. Process Stripe refund for each payment record
                for (const payment of (payments || [])) {
                    if (!payment.stripe_payment_intent_id || payment.stripe_payment_intent_id.startsWith('temp_')) {
                        logger_1.logger.warn({ bookingId, piId: payment.stripe_payment_intent_id }, 'Skipping refund — no valid payment_intent_id');
                        continue;
                    }
                    try {
                        const refund = yield stripe_1.stripe.refunds.create({
                            payment_intent: payment.stripe_payment_intent_id,
                            amount: Math.round(payment.amount * 100),
                            metadata: {
                                booking_id: bookingId,
                                cancelled_by_employee: employeeId,
                                cancelled_at: new Date().toISOString()
                            }
                        }, empStripeOpts);
                        refundIds.push(refund.id);
                        yield database_1.supabase
                            .from('payments')
                            .update({
                            status: 'refunded',
                            refunded_at: new Date().toISOString(),
                            refund_amount: payment.amount
                        })
                            .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);
                        logger_1.logger.info({ bookingId, refundId: refund.id, amount: payment.amount }, 'Employee refund processed for payment');
                    }
                    catch (stripeError) {
                        logger_1.logger.error({ err: stripeError, bookingId, piId: payment.stripe_payment_intent_id }, 'Error processing employee refund');
                        // Don't fail the entire request since the booking is already cancelled in DB.
                    }
                }
            }
            else {
                logger_1.logger.info({ bookingId, employeeId }, 'Refund skipped — session ended without refund');
            }
            // 5. Get booking details needed for the socket update
            const { data: bookingDetails } = yield database_1.supabase
                .from('bookings')
                .select('location_id, space_id')
                .eq('id', bookingId)
                .single();
            // 6. Delete any pending reminder notification so it doesn't fire after cancellation
            yield notification_service_1.NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');
            // 7. Send cancellation email notification
            const cancelReason = skipRefund
                ? (reason || 'Session ended by staff')
                : (reason || 'Cancelled by staff');
            try {
                yield email_service_1.EmailService.sendCancellationEmail(bookingId, cancelReason, 'employee', undefined, refundIds.length > 0);
            }
            catch (emailError) {
                logger_1.logger.error({ err: emailError, bookingId }, 'Error sending cancellation email for booking');
            }
            return {
                success: true,
                bookingId,
                refundIds,
                refunded: refundIds.length > 0,
                locationId: bookingDetails === null || bookingDetails === void 0 ? void 0 : bookingDetails.location_id,
                spaceId: bookingDetails === null || bookingDetails === void 0 ? void 0 : bookingDetails.space_id,
                message: skipRefund
                    ? 'Session ended by staff (no refund)'
                    : refundIds.length > 0
                        ? `Booking cancelled and ${refundIds.length} payment(s) refunded by staff`
                        : 'Booking cancelled by staff (no refund processed)'
            };
        });
    }
    cancelReservedBooking(bookingId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!bookingId || !userId) {
                throw new Error('Booking ID and User ID are required');
            }
            // 1. Get the booking details
            const { data: booking, error: fetchError } = yield database_1.supabase
                .from('bookings')
                .select('id, user_id, start_time, status, location_id, space_id')
                .eq('id', bookingId)
                .eq('user_id', userId)
                .single();
            if (fetchError || !booking) {
                throw new Error('Reserved booking not found or access denied');
            }
            // 2. Check if booking can be cancelled (must be reserved status)
            if (booking.status !== 'reserved') {
                throw new Error('Only reserved bookings can be cancelled through this endpoint');
            }
            // 3. Update booking status to abandoned (reservation cancelled) and immediately expire it
            const { error: updateBookingError } = yield database_1.supabase
                .from('bookings')
                .update({
                status: 'abandoned',
                expires_at: new Date().toISOString()
            })
                .eq('id', bookingId);
            if (updateBookingError) {
                logger_1.logger.error({ err: updateBookingError, bookingId }, 'Error updating reserved booking to cancelled');
                throw updateBookingError;
            }
            logger_1.logger.info({ bookingId }, 'Reserved booking abandoned and time slot freed for new reservations');
            // 4. Create cancellation record (no refund needed since no payment was made)
            const { error: cancellationError } = yield database_1.supabase
                .from('booking_cancellations')
                .insert({
                booking_id: bookingId,
                cancelled_by: userId,
                cancellation_reason: 'Reservation abandoned by customer',
                cancellation_fee: 0,
                refund_amount: 0,
                cancelled_at: new Date().toISOString()
            });
            if (cancellationError) {
                logger_1.logger.error({ err: cancellationError, bookingId }, 'Error creating cancellation record for reserved booking');
                // Don't fail the request since booking was already cancelled successfully
            }
            return {
                success: true,
                bookingId,
                locationId: booking.location_id,
                spaceId: booking.space_id,
                message: 'Reservation abandoned successfully'
            };
        });
    }
}
exports.BookingCancelService = BookingCancelService;
