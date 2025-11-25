import { supabase } from '../../config/database';

export interface AccessLogData {
  bay_id: string;
  booking_id?: string;
  user_id?: string;
  action: 'session_started' | 'session_ended' | 'door_unlock_button_pressed' | 'door_unlock_success' | 'door_unlock_failure' | 'booking_reserved';
  success: boolean;
  ip_address?: string;
  error_message?: string;
  location_id?: string;
  user_agent?: string;
  unlock_method?: 'email_link' | 'admin_override' | 'mobile_app';
  response_time_ms?: number;
  unlock_token_used?: string;
  metadata?: any; // JSON field for flexible data storage
}

export class LogService {
  async createAccessLog(logData: AccessLogData) {
    if (!logData.bay_id || !logData.action) {
      throw new Error('Bay ID and action are required for access logs');
    }

    // If booking_id is provided but user_id is not, look up the user_id from the booking
    let enrichedLogData = { ...logData };
    
    if (logData.booking_id && !logData.user_id) {
      try {
        const { data: booking } = await supabase
          .from('bookings')
          .select('user_id, location_id')
          .eq('id', logData.booking_id)
          .single();

        if (booking) {
          enrichedLogData.user_id = booking.user_id;
          // Also fill in location_id if not provided
          if (!enrichedLogData.location_id) {
            enrichedLogData.location_id = booking.location_id;
          }
        }
      } catch (lookupError) {
        console.warn('Could not look up user_id from booking:', lookupError);
        // Continue without the user_id - don't fail the log creation
      }
    }

    const { data, error } = await supabase
      .from('access_logs')
      .insert({
        ...enrichedLogData,
        timestamp: new Date().toISOString(), // Ensure timestamp is set
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating access log:', error);
      throw new Error('Failed to create access log');
    }

    return data;
  }
} 