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
exports.enqueuePostBookingReviews = enqueuePostBookingReviews;
const database_1 = require("../config/database");
const email_service_1 = require("../modules/email/email.service");
const logger_1 = require("../shared/utils/logger");
const GOOGLE_REVIEW_URL = 'https://g.page/r/CfzGYDMVDMV9EBM/review';
/**
 * Queue review request emails for bookings that ended ~5 minutes ago.
 * Runs every 5 min with a 7-min lookback window (2 min overlap for boundary safety).
 * Dedup is handled by NotificationService.notificationExists() inside sendPostBookingReviewEmail.
 */
function enqueuePostBookingReviews() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const now = Date.now();
            const windowStart = new Date(now - 7 * 60 * 1000).toISOString();
            const windowEnd = new Date(now).toISOString();
            const { data: endedBookings, error } = yield database_1.supabase
                .from('bookings')
                .select('id')
                .in('status', ['confirmed', 'completed'])
                .gte('end_time', windowStart)
                .lte('end_time', windowEnd);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching ended bookings for review emails');
                return;
            }
            if (!endedBookings || endedBookings.length === 0) {
                return;
            }
            // Batch-check which bookings already have review notifications
            const bookingIds = endedBookings.map(b => b.id);
            const { data: existingReviews, error: reviewError } = yield database_1.supabase
                .from('notifications')
                .select('booking_id')
                .in('booking_id', bookingIds)
                .eq('type', 'post_booking_review');
            if (reviewError) {
                logger_1.logger.error({ err: reviewError }, 'Error checking existing review notifications');
                return;
            }
            const existingIds = new Set((existingReviews || []).map(r => r.booking_id));
            const bookingsNeedingReviews = endedBookings.filter(b => !existingIds.has(b.id));
            if (bookingsNeedingReviews.length === 0) {
                return;
            }
            logger_1.logger.info({ count: bookingsNeedingReviews.length }, 'Queueing post-booking review emails');
            for (const booking of bookingsNeedingReviews) {
                try {
                    yield email_service_1.EmailService.sendPostBookingReviewEmail(booking.id, GOOGLE_REVIEW_URL);
                }
                catch (error) {
                    logger_1.logger.error({ err: error, bookingId: booking.id }, 'Error queueing review email for booking');
                }
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error }, 'Error in enqueuePostBookingReviews');
        }
    });
}
