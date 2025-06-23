import { handleExpiredReservations } from './expired-reservations.job';
import { dispatchNotifications } from './notifications.job';
import { enqueueReminders } from './reminder.job';

export function startScheduler() {
  // Run the expiration check every 2 minutes
  setInterval(handleExpiredReservations, 2 * 60 * 1000);
  
  // Run the notification dispatch every minute
  setInterval(dispatchNotifications, 60 * 1000);
  
  // Run the reminder check every 5 minutes
  setInterval(enqueueReminders, 5 * 60 * 1000);
  
  console.log('Background job scheduler started (expiration: 2min, notifications: 1min, reminders: 5min)');
} 