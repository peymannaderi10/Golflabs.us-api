"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const resend_1 = require("../../config/resend");
const notification_service_1 = require("./notification.service");
const email_template_service_1 = require("./email-template.service");
class EmailService {
    /**
     * Send a thank you email after booking confirmation
     */
    static sendThankYouEmail(bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const exists = yield notification_service_1.NotificationService.notificationExists(bookingId, 'thank_you');
                if (exists) {
                    console.log(`Thank you email already exists for booking ${bookingId}`);
                    return;
                }
                const bookingData = yield notification_service_1.NotificationService.getBookingEmailData(bookingId);
                if (!bookingData) {
                    console.error(`Could not get booking data for thank you email: ${bookingId}`);
                    return;
                }
                const rendered = yield email_template_service_1.EmailTemplateService.renderBookingConfirmation(bookingData.locationId, bookingData);
                const notificationId = yield notification_service_1.NotificationService.createNotification({
                    locationId: bookingData.locationId,
                    userId: bookingData.userId,
                    bookingId: bookingId,
                    type: 'thank_you',
                    recipient: bookingData.userEmail,
                    subject: rendered.subject,
                    content: rendered.html
                });
                console.log(`Created thank you notification ${notificationId} for booking ${bookingId}`);
            }
            catch (error) {
                console.error(`Error sending thank you email for booking ${bookingId}:`, error);
            }
        });
    }
    /**
     * Send a reminder email with unlock token
     */
    static sendReminderEmail(bookingId, unlockToken, unlockLink) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const exists = yield notification_service_1.NotificationService.notificationExists(bookingId, 'reminder');
                if (exists) {
                    console.log(`Reminder email already exists for booking ${bookingId}`);
                    return;
                }
                const bookingData = yield notification_service_1.NotificationService.getBookingEmailData(bookingId);
                if (!bookingData) {
                    console.error(`Could not get booking data for reminder email: ${bookingId}`);
                    return;
                }
                const emailData = Object.assign(Object.assign({}, bookingData), { unlockToken,
                    unlockLink });
                const rendered = yield email_template_service_1.EmailTemplateService.renderBookingReminder(bookingData.locationId, emailData);
                const notificationId = yield notification_service_1.NotificationService.createNotification({
                    locationId: bookingData.locationId,
                    userId: bookingData.userId,
                    bookingId: bookingId,
                    type: 'reminder',
                    recipient: bookingData.userEmail,
                    subject: rendered.subject,
                    content: rendered.html
                });
                console.log(`Created reminder notification ${notificationId} for booking ${bookingId}`);
            }
            catch (error) {
                console.error(`Error sending reminder email for booking ${bookingId}:`, error);
            }
        });
    }
    /**
     * Send a cancellation email
     */
    static sendCancellationEmail(bookingId_1, cancellationReason_1) {
        return __awaiter(this, arguments, void 0, function* (bookingId, cancellationReason, cancelledBy = 'customer', refundAmount, refundProcessed = false) {
            try {
                const exists = yield notification_service_1.NotificationService.notificationExists(bookingId, 'cancellation');
                if (exists) {
                    console.log(`Cancellation email already exists for booking ${bookingId}`);
                    return;
                }
                const bookingData = yield notification_service_1.NotificationService.getBookingEmailData(bookingId);
                if (!bookingData) {
                    console.error(`Could not get booking data for cancellation email: ${bookingId}`);
                    return;
                }
                const emailData = Object.assign(Object.assign({}, bookingData), { cancellationReason,
                    cancelledBy,
                    refundAmount,
                    refundProcessed });
                const rendered = yield email_template_service_1.EmailTemplateService.renderBookingCancellation(bookingData.locationId, emailData);
                const notificationId = yield notification_service_1.NotificationService.createNotification({
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
            }
            catch (error) {
                console.error(`Error sending cancellation email for booking ${bookingId}:`, error);
            }
        });
    }
    /**
     * Send an email using Resend
     */
    static sendEmail(to, subject, html) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const response = yield resend_1.resend.emails.send({
                    from: resend_1.resendConfig.fromEmail,
                    to: [to],
                    subject: subject,
                    html: html
                });
                if (response.error) {
                    throw new Error(`Resend API error: ${response.error.message}`);
                }
                return ((_a = response.data) === null || _a === void 0 ? void 0 : _a.id) || '';
            }
            catch (error) {
                console.error('Error sending email via Resend:', error);
                throw error;
            }
        });
    }
    /**
     * Process and dispatch pending notifications
     */
    static dispatchPendingNotifications() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const pendingNotifications = yield notification_service_1.NotificationService.getPendingNotifications(50);
                if (pendingNotifications.length === 0) {
                    return 0;
                }
                console.log(`Processing ${pendingNotifications.length} pending notifications`);
                let dispatched = 0;
                for (const notification of pendingNotifications) {
                    try {
                        const messageId = yield this.sendEmail(notification.recipient, notification.subject, notification.content);
                        yield notification_service_1.NotificationService.markAsSent(notification.id, messageId);
                        dispatched++;
                        console.log(`Sent notification ${notification.id} (${notification.type}) to ${notification.recipient}`);
                    }
                    catch (error) {
                        console.error(`Failed to send notification ${notification.id}:`, error);
                        yield notification_service_1.NotificationService.markAsFailed(notification.id, error.message);
                    }
                    yield new Promise(res => setTimeout(res, 1000));
                }
                console.log(`Dispatched ${dispatched}/${pendingNotifications.length} notifications`);
                return dispatched;
            }
            catch (error) {
                console.error('Error dispatching notifications:', error);
                return 0;
            }
        });
    }
    // =====================================================
    // Team League Emails (direct send, not booking-based)
    // =====================================================
    static sendTeamInviteEmail(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rendered = yield email_template_service_1.EmailTemplateService.renderTeamInvite(locationId, data);
                yield this.sendEmail(data.invitedEmail, rendered.subject, rendered.html);
                console.log(`Sent team invite email to ${data.invitedEmail} for team "${data.teamName}"`);
            }
            catch (error) {
                console.error(`Failed to send team invite email to ${data.invitedEmail}:`, error);
            }
        });
    }
    static sendTeamStatusEmail(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rendered = yield email_template_service_1.EmailTemplateService.renderTeamStatus(locationId, data);
                yield this.sendEmail(data.recipientEmail, rendered.subject, rendered.html);
                console.log(`Sent team status email to ${data.recipientEmail} for team "${data.teamName}"`);
            }
            catch (error) {
                console.error(`Failed to send team status email to ${data.recipientEmail}:`, error);
            }
        });
    }
    static sendAttendanceReminderEmail(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rendered = yield email_template_service_1.EmailTemplateService.renderAttendanceReminder(locationId, data);
                yield this.sendEmail(data.playerEmail, rendered.subject, rendered.html);
                console.log(`Sent attendance reminder to ${data.playerEmail} for ${data.leagueName} Week ${data.weekNumber}`);
            }
            catch (error) {
                console.error(`Failed to send attendance reminder to ${data.playerEmail}:`, error);
            }
        });
    }
    static sendLeagueEnrollmentEmail(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rendered = yield email_template_service_1.EmailTemplateService.renderEnrollmentConfirmation(locationId, data);
                yield this.sendEmail(data.playerEmail, rendered.subject, rendered.html);
                console.log(`Sent league enrollment confirmation to ${data.playerEmail} for "${data.leagueName}"`);
            }
            catch (error) {
                console.error(`Failed to send league enrollment email to ${data.playerEmail}:`, error);
            }
        });
    }
    // =====================================================
    // Membership Emails (direct send)
    // =====================================================
    static sendMembershipWelcomeEmail(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rendered = yield email_template_service_1.EmailTemplateService.renderMembershipWelcome(locationId, data);
                yield this.sendEmail(data.userEmail, rendered.subject, rendered.html);
                console.log(`Sent membership welcome email to ${data.userEmail} for plan "${data.planName}"`);
            }
            catch (error) {
                console.error(`Failed to send membership welcome email to ${data.userEmail}:`, error);
            }
        });
    }
    static sendMembershipCanceledEmail(locationId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rendered = yield email_template_service_1.EmailTemplateService.renderMembershipCanceled(locationId, data);
                yield this.sendEmail(data.userEmail, rendered.subject, rendered.html);
                console.log(`Sent membership cancellation email to ${data.userEmail} for plan "${data.planName}"`);
            }
            catch (error) {
                console.error(`Failed to send membership cancellation email to ${data.userEmail}:`, error);
            }
        });
    }
}
exports.EmailService = EmailService;
