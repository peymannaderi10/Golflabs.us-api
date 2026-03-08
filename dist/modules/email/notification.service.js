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
exports.NotificationService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
class NotificationService {
    /**
     * Create a new notification record
     */
    static createNotification(params) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const notificationData = {
                location_id: params.locationId,
                user_id: params.userId,
                booking_id: params.bookingId,
                type: params.type,
                channel: 'email',
                recipient: params.recipient,
                subject: params.subject,
                content: params.content,
                status: 'pending',
                scheduled_for: (_a = params.scheduledFor) === null || _a === void 0 ? void 0 : _a.toISOString(),
                metadata: params.metadata || {}
            };
            const { data, error } = yield database_1.supabase
                .from('notifications')
                .insert(notificationData)
                .select('id')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error creating notification');
                throw new Error(`Failed to create notification: ${error.message}`);
            }
            return data.id;
        });
    }
    /**
     * Get pending notifications ready to be sent
     */
    static getPendingNotifications() {
        return __awaiter(this, arguments, void 0, function* (limit = 50) {
            const now = new Date().toISOString();
            const { data, error } = yield database_1.supabase
                .from('notifications')
                .select('*')
                .eq('status', 'pending')
                .eq('channel', 'email')
                .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
                .order('created_at', { ascending: true })
                .limit(limit);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching pending notifications');
                throw new Error(`Failed to fetch pending notifications: ${error.message}`);
            }
            return data || [];
        });
    }
    /**
     * Mark notification as sent
     */
    static markAsSent(notificationId, resendMessageId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('notifications')
                .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                resend_message_id: resendMessageId
            })
                .eq('id', notificationId);
            if (error) {
                logger_1.logger.error({ err: error, notificationId }, 'Error marking notification as sent');
                throw new Error(`Failed to mark notification as sent: ${error.message}`);
            }
        });
    }
    /**
     * Mark notification as failed
     */
    static markAsFailed(notificationId, errorMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('notifications')
                .update({
                status: 'failed',
                error_message: errorMessage
            })
                .eq('id', notificationId);
            if (error) {
                logger_1.logger.error({ err: error, notificationId }, 'Error marking notification as failed');
            }
        });
    }
    /**
     * Update notification status from webhook
     */
    static updateFromWebhook(resendMessageId, status, deliveredAt) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateData = {
                resend_status: status
            };
            if (status === 'delivered' && deliveredAt) {
                updateData.status = 'delivered';
                updateData.delivered_at = deliveredAt.toISOString();
            }
            else if (status === 'bounced' || status === 'complained') {
                updateData.status = 'failed';
            }
            const { error } = yield database_1.supabase
                .from('notifications')
                .update(updateData)
                .eq('resend_message_id', resendMessageId);
            if (error) {
                logger_1.logger.error({ err: error, resendMessageId }, 'Error updating notification status from webhook');
            }
        });
    }
    /**
     * Check if notification already exists for booking and type
     */
    static notificationExists(bookingId, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const { count, error } = yield database_1.supabase
                .from('notifications')
                .select('id', { count: 'exact' })
                .eq('booking_id', bookingId)
                .eq('type', type);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error checking notification existence');
                return false;
            }
            return (count || 0) > 0;
        });
    }
    /**
     * Get booking data for email templates
     */
    static getBookingEmailData(bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('bookings')
                .select(`
        id,
        start_time,
        end_time,
        total_amount,
        location_id,
        user_id,
        user_profiles (
          full_name,
          email
        ),
        bays (
          name
        ),
        locations (
          name,
          timezone
        )
      `)
                .eq('id', bookingId)
                .single();
            if (error) {
                logger_1.logger.error({ err: error, bookingId }, 'Error fetching booking data');
                return null;
            }
            if (!data) {
                logger_1.logger.error({ bookingId }, 'No booking found');
                return null;
            }
            // Check if we have the required related data
            if (!data.user_profiles || !data.bays || !data.locations) {
                logger_1.logger.error({ bookingId, hasUser: !!data.user_profiles, hasBay: !!data.bays, hasLocation: !!data.locations }, 'Missing related data for booking');
                return null;
            }
            // Supabase joins return arrays, so get the first element
            const userProfile = Array.isArray(data.user_profiles) ? data.user_profiles[0] : data.user_profiles;
            const bay = Array.isArray(data.bays) ? data.bays[0] : data.bays;
            const location = Array.isArray(data.locations) ? data.locations[0] : data.locations;
            if (!userProfile || !bay || !location) {
                logger_1.logger.error({ bookingId }, 'Missing required nested data for booking');
                return null;
            }
            return {
                userFullName: userProfile.full_name || 'Valued Customer',
                userEmail: userProfile.email,
                bookingId: data.id,
                bayName: bay.name,
                locationName: location.name,
                locationTimezone: location.timezone || 'America/New_York',
                startTime: data.start_time,
                endTime: data.end_time,
                totalAmount: data.total_amount * 100, // Convert to cents for consistency
                locationId: data.location_id,
                userId: data.user_id
            };
        });
    }
}
exports.NotificationService = NotificationService;
