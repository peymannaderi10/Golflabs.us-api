import { supabase } from '../config/database';
import { logger } from '../shared/utils/logger';

// Function to handle expired reservations
export async function handleExpiredReservations() {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'expired' })
      .lt('expires_at', now)
      .eq('status', 'reserved');

    if (error) {
      logger.error({ err: error }, 'Error handling expired reservations');
      return;
    }

    logger.info('Checked for expired reservations');

    // Clean up orphaned pending bookings (reservation holds off) older than 30 minutes.
    // These are created when a customer enters checkout without a reservation hold
    // and never completes payment.
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { error: pendingError } = await supabase
      .from('bookings')
      .update({ status: 'abandoned' })
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