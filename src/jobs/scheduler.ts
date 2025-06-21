import { handleExpiredReservations } from './expired-reservations.job';

export function startScheduler() {
  // Run the expiration check every minute
  setInterval(handleExpiredReservations, 60 * 1000);
  
  console.log('Background job scheduler started');
} 