import { resend, resendConfig } from '../../config/resend';
import { NotificationService } from './notification.service';
import { EmailTemplates } from './email.templates';
import { BookingEmailData } from './email.types';

export class EmailService {
  /**
   * Send a thank you email after booking confirmation
   */
  static async sendThankYouEmail(bookingId: string): Promise<void> {
    try {
      // Check if thank you email already sent
      const exists = await NotificationService.notificationExists(bookingId, 'thank_you');
      if (exists) {
        console.log(`Thank you email already exists for booking ${bookingId}`);
        return;
      }

      // Get booking data
      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        console.error(`Could not get booking data for thank you email: ${bookingId}`);
        return;
      }

      // Generate email template
      const template = EmailTemplates.thankYou(bookingData);

      // Create notification record
      const notificationId = await NotificationService.createNotification({
        locationId: bookingData.locationId,
        userId: bookingData.userId,
        bookingId: bookingId,
        type: 'thank_you',
        recipient: bookingData.userEmail,
        subject: template.subject,
        content: template.html
      });

      console.log(`Created thank you notification ${notificationId} for booking ${bookingId}`);
    } catch (error) {
      console.error(`Error sending thank you email for booking ${bookingId}:`, error);
    }
  }

  /**
   * Send a reminder email with unlock token
   */
  static async sendReminderEmail(
    bookingId: string, 
    unlockToken: string, 
    unlockLink: string
  ): Promise<void> {
    try {
      // Check if reminder email already sent
      const exists = await NotificationService.notificationExists(bookingId, 'reminder');
      if (exists) {
        console.log(`Reminder email already exists for booking ${bookingId}`);
        return;
      }

      // Get booking data
      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        console.error(`Could not get booking data for reminder email: ${bookingId}`);
        return;
      }

      // Add unlock data
      const emailData: BookingEmailData = {
        ...bookingData,
        unlockToken,
        unlockLink
      };

      // Generate email template
      const template = EmailTemplates.reminder(emailData);

      // Create notification record
      const notificationId = await NotificationService.createNotification({
        locationId: bookingData.locationId,
        userId: bookingData.userId,
        bookingId: bookingId,
        type: 'reminder',
        recipient: bookingData.userEmail,
        subject: template.subject,
        content: template.html
      });

      console.log(`Created reminder notification ${notificationId} for booking ${bookingId}`);
    } catch (error) {
      console.error(`Error sending reminder email for booking ${bookingId}:`, error);
    }
  }

  /**
   * Send an email using Resend
   */
  static async sendEmail(to: string, subject: string, html: string): Promise<string> {
    try {
      const response = await resend.emails.send({
        from: resendConfig.fromEmail,
        to: [to],
        subject: subject,
        html: html
      });

      if (response.error) {
        throw new Error(`Resend API error: ${response.error.message}`);
      }

      return response.data?.id || '';
    } catch (error) {
      console.error('Error sending email via Resend:', error);
      throw error;
    }
  }

  /**
   * Process and dispatch pending notifications
   */
  static async dispatchPendingNotifications(): Promise<number> {
    try {
      const pendingNotifications = await NotificationService.getPendingNotifications(50);
      
      if (pendingNotifications.length === 0) {
        return 0;
      }

      console.log(`Processing ${pendingNotifications.length} pending notifications`);

      let dispatched = 0;
      for (const notification of pendingNotifications) {
        try {
          const messageId = await this.sendEmail(
            notification.recipient,
            notification.subject,
            notification.content
          );

          await NotificationService.markAsSent(notification.id, messageId);
          dispatched++;
          
          console.log(`Sent notification ${notification.id} (${notification.type}) to ${notification.recipient}`);
        } catch (error: any) {
          console.error(`Failed to send notification ${notification.id}:`, error);
          await NotificationService.markAsFailed(notification.id, error.message);
        }

        // Add a delay to respect API rate limits (e.g., 1 second)
        await new Promise(res => setTimeout(res, 1000));
      }

      console.log(`Dispatched ${dispatched}/${pendingNotifications.length} notifications`);
      return dispatched;
    } catch (error) {
      console.error('Error dispatching notifications:', error);
      return 0;
    }
  }
} 