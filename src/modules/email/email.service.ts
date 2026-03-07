import { resend, resendConfig } from '../../config/resend';
import { NotificationService } from './notification.service';
import { EmailTemplateService } from './email-template.service';
import { BookingEmailData, TeamInviteEmailData, TeamStatusEmailData, AttendanceReminderEmailData, LeagueEnrollmentEmailData, MembershipEmailData } from './email.types';

export class EmailService {
  /**
   * Send a thank you email after booking confirmation
   */
  static async sendThankYouEmail(bookingId: string): Promise<void> {
    try {
      const exists = await NotificationService.notificationExists(bookingId, 'thank_you');
      if (exists) {
        console.log(`Thank you email already exists for booking ${bookingId}`);
        return;
      }

      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        console.error(`Could not get booking data for thank you email: ${bookingId}`);
        return;
      }

      const rendered = await EmailTemplateService.renderBookingConfirmation(
        bookingData.locationId,
        bookingData
      );

      const notificationId = await NotificationService.createNotification({
        locationId: bookingData.locationId,
        userId: bookingData.userId,
        bookingId: bookingId,
        type: 'thank_you',
        recipient: bookingData.userEmail,
        subject: rendered.subject,
        content: rendered.html
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
      const exists = await NotificationService.notificationExists(bookingId, 'reminder');
      if (exists) {
        console.log(`Reminder email already exists for booking ${bookingId}`);
        return;
      }

      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        console.error(`Could not get booking data for reminder email: ${bookingId}`);
        return;
      }

      const emailData: BookingEmailData = {
        ...bookingData,
        unlockToken,
        unlockLink
      };

      const rendered = await EmailTemplateService.renderBookingReminder(
        bookingData.locationId,
        emailData
      );

      const notificationId = await NotificationService.createNotification({
        locationId: bookingData.locationId,
        userId: bookingData.userId,
        bookingId: bookingId,
        type: 'reminder',
        recipient: bookingData.userEmail,
        subject: rendered.subject,
        content: rendered.html
      });

      console.log(`Created reminder notification ${notificationId} for booking ${bookingId}`);
    } catch (error) {
      console.error(`Error sending reminder email for booking ${bookingId}:`, error);
    }
  }

  /**
   * Send a cancellation email
   */
  static async sendCancellationEmail(
    bookingId: string,
    cancellationReason?: string,
    cancelledBy: 'customer' | 'employee' = 'customer',
    refundAmount?: number,
    refundProcessed: boolean = false
  ): Promise<void> {
    try {
      const exists = await NotificationService.notificationExists(bookingId, 'cancellation');
      if (exists) {
        console.log(`Cancellation email already exists for booking ${bookingId}`);
        return;
      }

      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        console.error(`Could not get booking data for cancellation email: ${bookingId}`);
        return;
      }

      const emailData: BookingEmailData = {
        ...bookingData,
        cancellationReason,
        cancelledBy,
        refundAmount,
        refundProcessed
      };

      const rendered = await EmailTemplateService.renderBookingCancellation(
        bookingData.locationId,
        emailData
      );

      const notificationId = await NotificationService.createNotification({
        locationId: bookingData.locationId,
        userId: bookingData.userId,
        bookingId: bookingId,
        type: 'cancellation',
        recipient: bookingData.userEmail,
        subject: rendered.subject,
        content: rendered.html,
        metadata: {
          cancellationReason,
          cancelledBy,
          refundAmount,
          refundProcessed
        }
      });

      console.log(`Created cancellation notification ${notificationId} for booking ${bookingId}`);
    } catch (error) {
      console.error(`Error sending cancellation email for booking ${bookingId}:`, error);
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

        await new Promise(res => setTimeout(res, 1000));
      }

      console.log(`Dispatched ${dispatched}/${pendingNotifications.length} notifications`);
      return dispatched;
    } catch (error) {
      console.error('Error dispatching notifications:', error);
      return 0;
    }
  }

  // =====================================================
  // Team League Emails (direct send, not booking-based)
  // =====================================================

  static async sendTeamInviteEmail(locationId: string, data: TeamInviteEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderTeamInvite(locationId, data);
      await this.sendEmail(data.invitedEmail, rendered.subject, rendered.html);
      console.log(`Sent team invite email to ${data.invitedEmail} for team "${data.teamName}"`);
    } catch (error) {
      console.error(`Failed to send team invite email to ${data.invitedEmail}:`, error);
    }
  }

  static async sendTeamStatusEmail(locationId: string, data: TeamStatusEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderTeamStatus(locationId, data);
      await this.sendEmail(data.recipientEmail, rendered.subject, rendered.html);
      console.log(`Sent team status email to ${data.recipientEmail} for team "${data.teamName}"`);
    } catch (error) {
      console.error(`Failed to send team status email to ${data.recipientEmail}:`, error);
    }
  }

  static async sendAttendanceReminderEmail(locationId: string, data: AttendanceReminderEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderAttendanceReminder(locationId, data);
      await this.sendEmail(data.playerEmail, rendered.subject, rendered.html);
      console.log(`Sent attendance reminder to ${data.playerEmail} for ${data.leagueName} Week ${data.weekNumber}`);
    } catch (error) {
      console.error(`Failed to send attendance reminder to ${data.playerEmail}:`, error);
    }
  }

  static async sendLeagueEnrollmentEmail(locationId: string, data: LeagueEnrollmentEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderEnrollmentConfirmation(locationId, data);
      await this.sendEmail(data.playerEmail, rendered.subject, rendered.html);
      console.log(`Sent league enrollment confirmation to ${data.playerEmail} for "${data.leagueName}"`);
    } catch (error) {
      console.error(`Failed to send league enrollment email to ${data.playerEmail}:`, error);
    }
  }

  // =====================================================
  // Membership Emails (direct send)
  // =====================================================

  static async sendMembershipWelcomeEmail(locationId: string, data: MembershipEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderMembershipWelcome(locationId, data);
      await this.sendEmail(data.userEmail, rendered.subject, rendered.html);
      console.log(`Sent membership welcome email to ${data.userEmail} for plan "${data.planName}"`);
    } catch (error) {
      console.error(`Failed to send membership welcome email to ${data.userEmail}:`, error);
    }
  }

  static async sendMembershipCanceledEmail(locationId: string, data: MembershipEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderMembershipCanceled(locationId, data);
      await this.sendEmail(data.userEmail, rendered.subject, rendered.html);
      console.log(`Sent membership cancellation email to ${data.userEmail} for plan "${data.planName}"`);
    } catch (error) {
      console.error(`Failed to send membership cancellation email to ${data.userEmail}:`, error);
    }
  }
}
