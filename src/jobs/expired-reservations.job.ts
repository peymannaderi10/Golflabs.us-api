import { supabase } from '../config/database';

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
      console.error('Error handling expired reservations:', error);
      return;
    }

    console.log('Checked for expired reservations');
  } catch (error) {
    console.error('Error in handleExpiredReservations:', error);
  }
} 