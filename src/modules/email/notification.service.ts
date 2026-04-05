import { supabase } from '../../config/database';
import { CreateNotificationParams, NotificationRecord } from './email.types';
import { logger } from '../../shared/utils/logger';
import { LocationService } from '../locations/location.service';

export class NotificationService {
  /**
   * Create a new notification record
   */
  static async createNotification(params: CreateNotificationParams): Promise<string> {
    const notificationData = {
      location_id: params.locationId,
      user_id: params.userId,
      booking_id: params.bookingId,
      type: params.type,
      channel: 'email' as const,
      recipient: params.recipient,
      subject: params.subject,
      content: params.content,
      status: 'pending' as const,
      scheduled_for: params.scheduledFor?.toISOString(),
      metadata: params.metadata || {}
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert(notificationData)
      .select('id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error creating notification');
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Get pending notifications ready to be sent
   */
  static async getPendingNotifications(limit: number = 50): Promise<NotificationRecord[]> {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('status', 'pending')
      .eq('channel', 'email')
      .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error({ err: error }, 'Error fetching pending notifications');
      throw new Error(`Failed to fetch pending notifications: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Mark notification as sent
   */
  static async markAsSent(notificationId: string, resendMessageId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        resend_message_id: resendMessageId
      })
      .eq('id', notificationId);

    if (error) {
      logger.error({ err: error, notificationId }, 'Error marking notification as sent');
      throw new Error(`Failed to mark notification as sent: ${error.message}`);
    }
  }

  /**
   * Mark notification as failed
   */
  static async markAsFailed(notificationId: string, errorMessage: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'failed',
        error_message: errorMessage
      })
      .eq('id', notificationId);

    if (error) {
      logger.error({ err: error, notificationId }, 'Error marking notification as failed');
    }
  }

  /**
   * Update notification status from webhook
   */
  static async updateFromWebhook(
    resendMessageId: string, 
    status: 'delivered' | 'bounced' | 'complained',
    deliveredAt?: Date
  ): Promise<void> {
    const updateData: Partial<NotificationRecord> = {
      resend_status: status
    };

    if (status === 'delivered' && deliveredAt) {
      updateData.status = 'delivered';
      updateData.delivered_at = deliveredAt.toISOString();
    } else if (status === 'bounced' || status === 'complained') {
      updateData.status = 'failed';
    }

    const { error } = await supabase
      .from('notifications')
      .update(updateData)
      .eq('resend_message_id', resendMessageId);

    if (error) {
      logger.error({ err: error, resendMessageId }, 'Error updating notification status from webhook');
    }
  }

  /**
   * Check if notification already exists for booking and type
   */
  static async notificationExists(bookingId: string, type: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact' })
      .eq('booking_id', bookingId)
      .eq('type', type);

    if (error) {
      logger.error({ err: error }, 'Error checking notification existence');
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Delete notifications by booking ID and type (e.g., clear old reminder when booking time changes)
   */
  static async deleteNotificationsByBookingAndType(bookingId: string, type: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('booking_id', bookingId)
      .eq('type', type);

    if (error) {
      logger.error({ err: error, bookingId, type }, 'Error deleting notifications');
    }
  }

  /**
   * Get booking data for email templates
   */
  static async getBookingEmailData(bookingId: string): Promise<{
    userFullName: string;
    userEmail: string;
    bookingId: string;
    spaceName: string;
    locationName: string;
    locationTimezone: string;
    startTime: string;
    endTime: string;
    totalAmount: number;
    locationId: string;
    userId: string;
    hasDoorLock: boolean;
  } | null> {
    const { data, error } = await supabase
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
        spaces (
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
      logger.error({ err: error, bookingId }, 'Error fetching booking data');
      return null;
    }

    if (!data) {
      logger.error({ bookingId }, 'No booking found');
      return null;
    }

    // Check if we have the required related data
    if (!data.user_profiles || !data.spaces || !data.locations) {
      logger.error({ bookingId, hasUser: !!data.user_profiles, hasSpace: !!data.spaces, hasLocation: !!data.locations }, 'Missing related data for booking');
      return null;
    }

    // Supabase joins return arrays, so get the first element
    const userProfile = Array.isArray(data.user_profiles) ? data.user_profiles[0] : data.user_profiles;
    const space = Array.isArray(data.spaces) ? data.spaces[0] : data.spaces;
    const location = Array.isArray(data.locations) ? data.locations[0] : data.locations;

    if (!userProfile || !space || !location) {
      logger.error({ bookingId }, 'Missing required nested data for booking');
      return null;
    }

    return {
      userFullName: userProfile.full_name || 'Valued Customer',
      userEmail: userProfile.email,
      bookingId: data.id,
      spaceName: space.name,
      locationName: location.name,
      locationTimezone: location.timezone || 'America/New_York',
      startTime: data.start_time,
      endTime: data.end_time,
      totalAmount: data.total_amount * 100, // Convert to cents for consistency
      locationId: data.location_id,
      userId: data.user_id,
      hasDoorLock: (await LocationService.getDoorLockType(data.location_id)) !== 'none',
    };
  }
} 