import { resend, resendConfig } from '../../config/resend';
import { NotificationService } from './notification.service';
import { EmailTemplateService } from './email-template.service';
import { BookingEmailData, TeamInviteEmailData, TeamStatusEmailData, AttendanceReminderEmailData, LeagueEnrollmentEmailData, MembershipEmailData } from './email.types';
import { logger } from '../../shared/utils/logger';

export class EmailService {
  /**
   * Send a thank you email after booking confirmation
   */
  static async sendThankYouEmail(bookingId: string): Promise<void> {
    try {
      const exists = await NotificationService.notificationExists(bookingId, 'thank_you');
      if (exists) {
        logger.info({ bookingId }, 'Thank you email already exists for booking');
        return;
      }

      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        logger.error({ bookingId }, 'Could not get booking data for thank you email');
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

      logger.info({ notificationId, bookingId }, 'Created thank you notification');
    } catch (error) {
      logger.error({ err: error, bookingId }, 'Error sending thank you email');
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
        logger.info({ bookingId }, 'Reminder email already exists for booking');
        return;
      }

      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        logger.error({ bookingId }, 'Could not get booking data for reminder email');
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

      logger.info({ notificationId, bookingId }, 'Created reminder notification');
    } catch (error) {
      logger.error({ err: error, bookingId }, 'Error sending reminder email');
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
        logger.info({ bookingId }, 'Cancellation email already exists for booking');
        return;
      }

      const bookingData = await NotificationService.getBookingEmailData(bookingId);
      if (!bookingData) {
        logger.error({ bookingId }, 'Could not get booking data for cancellation email');
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

      logger.info({ notificationId, bookingId }, 'Created cancellation notification');
    } catch (error) {
      logger.error({ err: error, bookingId }, 'Error sending cancellation email');
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
      logger.error({ err: error }, 'Error sending email via Resend');
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

      logger.info({ count: pendingNotifications.length }, 'Processing pending notifications');

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

          logger.info({ notificationId: notification.id, type: notification.type }, 'Sent notification');
        } catch (error: any) {
          logger.error({ err: error, notificationId: notification.id }, 'Failed to send notification');
          await NotificationService.markAsFailed(notification.id, error.message);
        }

        await new Promise(res => setTimeout(res, 1000));
      }

      logger.info({ dispatched, total: pendingNotifications.length }, 'Dispatched notifications');
      return dispatched;
    } catch (error) {
      logger.error({ err: error }, 'Error dispatching notifications');
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
      logger.info({ teamName: data.teamName }, 'Sent team invite email');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send team invite email');
    }
  }

  static async sendTeamStatusEmail(locationId: string, data: TeamStatusEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderTeamStatus(locationId, data);
      await this.sendEmail(data.recipientEmail, rendered.subject, rendered.html);
      logger.info({ teamName: data.teamName }, 'Sent team status email');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send team status email');
    }
  }

  static async sendAttendanceReminderEmail(locationId: string, data: AttendanceReminderEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderAttendanceReminder(locationId, data);
      await this.sendEmail(data.playerEmail, rendered.subject, rendered.html);
      logger.info({ leagueName: data.leagueName, weekNumber: data.weekNumber }, 'Sent attendance reminder');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send attendance reminder');
    }
  }

  static async sendLeagueEnrollmentEmail(locationId: string, data: LeagueEnrollmentEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderEnrollmentConfirmation(locationId, data);
      await this.sendEmail(data.playerEmail, rendered.subject, rendered.html);
      logger.info({ leagueName: data.leagueName }, 'Sent league enrollment confirmation');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send league enrollment email');
    }
  }

  // =====================================================
  // Membership Emails (direct send)
  // =====================================================

  static async sendMembershipWelcomeEmail(locationId: string, data: MembershipEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderMembershipWelcome(locationId, data);
      await this.sendEmail(data.userEmail, rendered.subject, rendered.html);
      logger.info({ planName: data.planName }, 'Sent membership welcome email');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send membership welcome email');
    }
  }

  static async sendMembershipCanceledEmail(locationId: string, data: MembershipEmailData): Promise<void> {
    try {
      const rendered = await EmailTemplateService.renderMembershipCanceled(locationId, data);
      await this.sendEmail(data.userEmail, rendered.subject, rendered.html);
      logger.info({ planName: data.planName }, 'Sent membership cancellation email');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send membership cancellation email');
    }
  }
}
