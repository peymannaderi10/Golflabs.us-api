import { supabase } from '../config/database';
import { resendConfig } from '../config/resend';
import { EmailService } from '../modules/email/email.service';
import { NotificationService } from '../modules/email/notification.service';
import { createUnlockToken } from '../shared/utils/token.utils';
import { logger } from '../shared/utils/logger';

/**
 * Process booking reminders for sessions starting in the next 16 minutes.
 * - Ideal: 14-16 min window sends ~15 min before booking
 * - Fallback: 0-14 min window catches any we missed (e.g. server was down) - better late than never
 */
export async function enqueueReminders(): Promise<void> {
  try {
    const now = Date.now();
    const windowStart = new Date(now).toISOString(); // from now
    const windowEnd = new Date(now + 16 * 60 * 1000).toISOString(); // up to 16 min from now

    logger.info({ windowStart, windowEnd }, 'Looking for bookings in reminder window');

    // Find confirmed bookings starting in ~15 minutes
    const { data: upcomingBookings, error } = await supabase
      .from('bookings')
      .select('id, user_id, location_id, start_time, end_time')
      .eq('status', 'confirmed')
      .gte('start_time', windowStart)
      .lte('start_time', windowEnd);

    if (error) {
      logger.error({ err: error }, 'Error fetching upcoming bookings');
      return;
    }

    if (!upcomingBookings || upcomingBookings.length === 0) {
      return;
    }

    logger.info({ count: upcomingBookings.length }, 'Found bookings needing reminders');

    // BATCH OPERATION: Check which bookings already have reminder notifications
    const bookingIds = upcomingBookings.map(booking => booking.id);
    const { data: existingReminders, error: reminderError } = await supabase
      .from('notifications')
      .select('booking_id')
      .in('booking_id', bookingIds)
      .eq('type', 'reminder');

    if (reminderError) {
      logger.error({ err: reminderError }, 'Error checking existing reminders');
      return;
    }

    // Create a Set for fast lookup of existing reminders
    const existingReminderIds = new Set(
      (existingReminders || []).map(reminder => reminder.booking_id)
    );

    // Filter out bookings that already have reminders
    const bookingsNeedingReminders = upcomingBookings.filter(
      booking => !existingReminderIds.has(booking.id)
    );

    if (bookingsNeedingReminders.length === 0) {
      logger.info('All upcoming bookings already have reminders');
      return;
    }

    logger.info({ count: bookingsNeedingReminders.length }, 'Processing bookings without reminders');

    for (const booking of bookingsNeedingReminders) {
      try {
        const token = createUnlockToken(booking.id, booking.start_time, booking.end_time);
        const unlockLink = `${resendConfig.frontendUrl}/unlock?token=${token}`;

        // Update booking with unlock token (partial update - only these columns)
        const { error: updateError } = await supabase
          .from('bookings')
          .update({
            unlock_token: token,
            unlock_token_expires_at: booking.end_time
          })
          .eq('id', booking.id);

        if (updateError) {
          logger.error({ err: updateError, bookingId: booking.id }, 'Error updating unlock token');
          continue;
        }

        // Queue the reminder email
        await EmailService.sendReminderEmail(booking.id, token, unlockLink);

        logger.info({ bookingId: booking.id }, 'Queued reminder for booking');
      } catch (error) {
        logger.error({ err: error, bookingId: booking.id }, 'Error processing reminder for booking');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in enqueueReminders');
  }
} 