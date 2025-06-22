import { supabase } from '../../config/database';
import { CreateNotificationParams, NotificationRecord } from './email.types';

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
      console.error('Error creating notification:', error);
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
      console.error('Error fetching pending notifications:', error);
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
      console.error(`Error marking notification ${notificationId} as sent:`, error);
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
      console.error(`Error marking notification ${notificationId} as failed:`, error);
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
      console.error(`Error updating notification status from webhook:`, error);
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
      console.error('Error checking notification existence:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Get booking data for email templates
   */
  static async getBookingEmailData(bookingId: string): Promise<{
    userFullName: string;
    userEmail: string;
    bookingId: string;
    bayName: string;
    locationName: string;
    locationTimezone: string;
    startTime: string;
    endTime: string;
    totalAmount: number;
    locationId: string;
    userId: string;
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
      console.error(`Error fetching booking data for ${bookingId}:`, error);
      return null;
    }

    if (!data) {
      console.error(`No booking found for ${bookingId}`);
      return null;
    }

    // Check if we have the required related data
    if (!data.user_profiles || !data.bays || !data.locations) {
      console.error(`Missing related data for booking ${bookingId}:`, {
        hasUser: !!data.user_profiles,
        hasBay: !!data.bays,
        hasLocation: !!data.locations
      });
      return null;
    }

    // Supabase joins return arrays, so get the first element
    const userProfile = Array.isArray(data.user_profiles) ? data.user_profiles[0] : data.user_profiles;
    const bay = Array.isArray(data.bays) ? data.bays[0] : data.bays;
    const location = Array.isArray(data.locations) ? data.locations[0] : data.locations;

    if (!userProfile || !bay || !location) {
      console.error(`Missing required nested data for booking ${bookingId}`);
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
  }
} 