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
  } catch (error) {
    logger.error({ err: error }, 'Error in handleExpiredReservations');
  }
} 