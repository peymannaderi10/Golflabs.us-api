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

    const { data, error } = await supabase
      .from('access_logs')
      .insert({
        ...logData,
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