import { EmailService } from '../modules/email/email.service';
import { logger } from '../shared/utils/logger';

/**
 * Dispatch pending email notifications
 * This function is called by the scheduler to process and send queued emails
 */
export async function dispatchNotifications(): Promise<void> {
  try {
    const dispatched = await EmailService.dispatchPendingNotifications();
    
    if (dispatched > 0) {
      logger.info({ count: dispatched }, 'Dispatched notifications');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error dispatching notifications');
  }
} 