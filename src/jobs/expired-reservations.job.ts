import { supabase } from '../config/database';
import { logger } from '../shared/utils/logger';

// Function to handle expired reservations
export async function handleExpiredReservations() {
  try {
    const now = new Date().toISOString();
    // Reserved bookings whose expires_at has passed → mark expired + record reason
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'expired',
        outcome_reason: 'reservation_timeout',
        terminated_at: now,
      })
      .lt('expires_at', now)
      .eq('status', 'reserved');

    if (error) {
      logger.error({ err: error }, 'Error handling expired reservations');
      return;
    }

    logger.info('Checked for expired reservations');

    // Orphaned pending bookings (holds off, no payment) older than 30 minutes
    // → mark abandoned + record reason. These are authenticated users who
    // reached checkout but never completed payment.
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { error: pendingError } = await supabase
      .from('bookings')
      .update({
        status: 'abandoned',
        outcome_reason: 'payment_never_attempted',
        terminated_at: now,
      })
      .eq('status', 'pending')
      .is('expires_at', null)
      .lt('created_at', thirtyMinAgo);

    if (pendingError) {
      logger.error({ err: pendingError }, 'Error cleaning up orphaned pending bookings');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in handleExpiredReservations');
  }
} 