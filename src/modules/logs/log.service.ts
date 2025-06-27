import { supabase } from '../../config/database';

export interface AccessLogData {
  bay_id: string;
  booking_id?: string;
  user_id?: string;
  action: 'session_started' | 'session_ended';
  success: boolean;
  ip_address?: string;
  error_message?: string;
  location_id?: string;
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