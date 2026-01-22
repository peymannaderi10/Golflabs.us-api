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

  async getAccessLogs(locationId: string, options: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    action?: string;
    success?: boolean;
  } = {}) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('access_logs')
      .select(`
        id,
        location_id,
        booking_id,
        bay_id,
        user_id,
        action,
        success,
        error_message,
        timestamp,
        ip_address,
        user_agent,
        metadata,
        unlock_method,
        response_time_ms,
        unlock_token_used,
        bookings:booking_id (
          id,
          start_time,
          end_time,
          user_profiles:user_id (
            id,
            email,
            full_name
          )
        ),
        bays:bay_id (
          id,
          bay_number,
          name
        ),
        user_profiles:user_id (
          id,
          email,
          full_name
        )
      `, { count: 'exact' })
      .eq('location_id', locationId)
      .order('timestamp', { ascending: false });

    if (options.startDate) {
      query = query.gte('timestamp', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('timestamp', options.endDate);
    }
    if (options.action) {
      query = query.eq('action', options.action);
    }
    if (options.success !== undefined) {
      query = query.eq('success', options.success);
    }

    const { data, error, count } = await query
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching access logs:', error);
      throw new Error('Failed to fetch access logs');
    }

    return {
      logs: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  }
} 