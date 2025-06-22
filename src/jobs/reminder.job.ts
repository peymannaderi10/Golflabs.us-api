import { supabase } from '../config/database';
import { resendConfig } from '../config/resend';
import { EmailService } from '../modules/email/email.service';
import { NotificationService } from '../modules/email/notification.service';

/**
 * Generate unlock token for booking - this would need to match your existing unlock token logic
 * For now, using a simple implementation
 */
function generateUnlockToken(bookingId: string, startTime: string, endTime: string): string {
  // This should match your existing token generation logic
  // Using a simple base64 encoding for demo - replace with your actual implementation
  const tokenData = {
    bookingId,
    startTime,
    endTime,
    expires: new Date(endTime).getTime()
  };
  
  return Buffer.from(JSON.stringify(tokenData)).toString('base64');
}

/**
 * Process booking reminders for sessions starting in ~15 minutes
 */
export async function enqueueReminders(): Promise<void> {
  try {
    const now = Date.now();
    const remindAt = new Date(now + 15 * 60 * 1000).toISOString(); // 15 minutes from now
    const windowStart = new Date(now + 14 * 60 * 1000).toISOString(); // 14 minutes from now

    console.log(`[Reminder Job] Looking for bookings starting between ${windowStart} and ${remindAt}`);

    // Find confirmed bookings starting in ~15 minutes
    const { data: upcomingBookings, error } = await supabase
      .from('bookings')
      .select('id, user_id, location_id, start_time, end_time')
      .eq('status', 'confirmed')
      .gte('start_time', windowStart)
      .lte('start_time', remindAt);

    if (error) {
      console.error('[Reminder Job] Error fetching upcoming bookings:', error);
      return;
    }

    if (!upcomingBookings || upcomingBookings.length === 0) {
      return;
    }

    console.log(`[Reminder Job] Found ${upcomingBookings.length} bookings needing reminders`);

    for (const booking of upcomingBookings) {
      try {
        // Skip if we already queued a reminder
        const exists = await NotificationService.notificationExists(booking.id, 'reminder');
        if (exists) {
          console.log(`[Reminder Job] Reminder already exists for booking ${booking.id}`);
          continue;
        }

        // Generate unlock token and link
        const token = generateUnlockToken(booking.id, booking.start_time, booking.end_time);
        const unlockLink = `${resendConfig.frontendUrl}/unlock?token=${token}`;

        // Update booking with unlock token
        await supabase
          .from('bookings')
          .update({
            unlock_token: token,
            unlock_token_expires_at: booking.end_time
          })
          .eq('id', booking.id);

        // Queue the reminder email
        await EmailService.sendReminderEmail(booking.id, token, unlockLink);

        console.log(`[Reminder Job] Queued reminder for booking ${booking.id}`);
      } catch (error) {
        console.error(`[Reminder Job] Error processing reminder for booking ${booking.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Reminder Job] Error in enqueueReminders:', error);
  }
} 