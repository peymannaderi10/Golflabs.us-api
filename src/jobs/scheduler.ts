import { handleExpiredReservations } from './expired-reservations.job';
import { dispatchNotifications } from './notifications.job';
import { enqueueReminders } from './reminder.job';

export function startScheduler() {
  // Run the expiration check every minute
  setInterval(handleExpiredReservations, 60 * 1000);
  
  // Run the notification dispatch every minute
  setInterval(dispatchNotifications, 60 * 1000);
  
  // Run the reminder check every minute
  setInterval(enqueueReminders, 60 * 1000);
  
  console.log('Background job scheduler started (expiration, notifications, reminders)');
} 