import { supabase } from '../config/database';
import { EmailService } from '../modules/email/email.service';
import { logger } from '../shared/utils/logger';

const GOOGLE_REVIEW_URL = 'https://g.page/r/CfzGYDMVDMV9EBM/review';

/**
 * Queue review request emails for bookings that ended ~5 minutes ago.
 * Runs every 5 min with a 7-min lookback window (2 min overlap for boundary safety).
 * Dedup is handled by NotificationService.notificationExists() inside sendPostBookingReviewEmail.
 */
export async function enqueuePostBookingReviews(): Promise<void> {
  try {
    const now = Date.now();
    const windowStart = new Date(now - 7 * 60 * 1000).toISOString();
    const windowEnd = new Date(now).toISOString();

    const { data: endedBookings, error } = await supabase
      .from('bookings')
      .select('id')
      .in('status', ['confirmed', 'completed'])
      .gte('end_time', windowStart)
      .lte('end_time', windowEnd);

    if (error) {
      logger.error({ err: error }, 'Error fetching ended bookings for review emails');
      return;
    }

    if (!endedBookings || endedBookings.length === 0) {
      return;
    }

    // Batch-check which bookings already have review notifications
    const bookingIds = endedBookings.map(b => b.id);
    const { data: existingReviews, error: reviewError } = await supabase
      .from('notifications')
      .select('booking_id')
      .in('booking_id', bookingIds)
      .eq('type', 'post_booking_review');

    if (reviewError) {
      logger.error({ err: reviewError }, 'Error checking existing review notifications');
      return;
    }

    const existingIds = new Set(
      (existingReviews || []).map(r => r.booking_id)
    );

    const bookingsNeedingReviews = endedBookings.filter(
      b => !existingIds.has(b.id)
    );

    if (bookingsNeedingReviews.length === 0) {
      return;
    }

    logger.info({ count: bookingsNeedingReviews.length }, 'Queueing post-booking review emails');

    for (const booking of bookingsNeedingReviews) {
      try {
        await EmailService.sendPostBookingReviewEmail(booking.id, GOOGLE_REVIEW_URL);
      } catch (error) {
        logger.error({ err: error, bookingId: booking.id }, 'Error queueing review email for booking');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in enqueuePostBookingReviews');
  }
}
