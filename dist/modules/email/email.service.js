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
const email_templates_1 = require("./email.templates");
class EmailService {
    /**
     * Send a thank you email after booking confirmation
     */
    static sendThankYouEmail(bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if thank you email already sent
                const exists = yield notification_service_1.NotificationService.notificationExists(bookingId, 'thank_you');
                if (exists) {
                    console.log(`Thank you email already exists for booking ${bookingId}`);
                    return;
                }
                // Get booking data
                const bookingData = yield notification_service_1.NotificationService.getBookingEmailData(bookingId);
                if (!bookingData) {
                    console.error(`Could not get booking data for thank you email: ${bookingId}`);
                    return;
                }
                // Generate email template
                const template = email_templates_1.EmailTemplates.thankYou(bookingData);
                // Create notification record
                const notificationId = yield notification_service_1.NotificationService.createNotification({
                    locationId: bookingData.locationId,
                    userId: bookingData.userId,
                    bookingId: bookingId,
                    type: 'thank_you',
                    recipient: bookingData.userEmail,
                    subject: template.subject,
                    content: template.html
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
                // Check if reminder email already sent
                const exists = yield notification_service_1.NotificationService.notificationExists(bookingId, 'reminder');
                if (exists) {
                    console.log(`Reminder email already exists for booking ${bookingId}`);
                    return;
                }
                // Get booking data
                const bookingData = yield notification_service_1.NotificationService.getBookingEmailData(bookingId);
                if (!bookingData) {
                    console.error(`Could not get booking data for reminder email: ${bookingId}`);
                    return;
                }
                // Add unlock data
                const emailData = Object.assign(Object.assign({}, bookingData), { unlockToken,
                    unlockLink });
                // Generate email template
                const template = email_templates_1.EmailTemplates.reminder(emailData);
                // Create notification record
                const notificationId = yield notification_service_1.NotificationService.createNotification({
                    locationId: bookingData.locationId,
                    userId: bookingData.userId,
                    bookingId: bookingId,
                    type: 'reminder',
                    recipient: bookingData.userEmail,
                    subject: template.subject,
                    content: template.html
                });
                console.log(`Created reminder notification ${notificationId} for booking ${bookingId}`);
            }
            catch (error) {
                console.error(`Error sending reminder email for booking ${bookingId}:`, error);
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
}
exports.EmailService = EmailService;
