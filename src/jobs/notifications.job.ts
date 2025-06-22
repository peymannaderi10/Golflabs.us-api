import { EmailService } from '../modules/email/email.service';

/**
 * Dispatch pending email notifications
 * This function is called by the scheduler to process and send queued emails
 */
export async function dispatchNotifications(): Promise<void> {
  try {
    const dispatched = await EmailService.dispatchPendingNotifications();
    
    if (dispatched > 0) {
      console.log(`[Notification Job] Dispatched ${dispatched} notifications`);
    }
  } catch (error) {
    console.error('[Notification Job] Error dispatching notifications:', error);
  }
} 