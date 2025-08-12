import { supabase } from '../../config/database';

export class BayService {
  async getBaysByLocationId(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('bays')
      .select('id, status, location_id, bay_number, name')
      .eq('location_id', locationId);

    if (error) {
      console.error('Error fetching bays:', error);
      throw new Error('Failed to fetch bays');
    }

    return data;
  }

  async updateBayHeartbeat(bayId: string, kioskIp: string | undefined) {
    if (!bayId) {
      throw new Error('Bay ID is required');
    }

    const { data, error } = await supabase
      .from('bays')
      .update({ 
        last_seen: new Date().toISOString(),
        kiosk_ip: kioskIp 
      })
      .eq('id', bayId)
      .select('id, last_seen, kiosk_ip')
      .single();

    if (error) {
      console.error('Error updating bay heartbeat:', error);
      throw new Error('Failed to update bay heartbeat');
    }
    
    if (!data) {
        throw new Error(`Bay with ID ${bayId} not found.`);
    }

    return data;
  }

  // Add: Update bay status
  async updateBayStatus(bayId: string, status: 'available' | 'closed') {
    if (!bayId) {
      throw new Error('Bay ID is required');
    }

    if (!['available', 'closed'].includes(status)) {
      throw new Error('Invalid status. Must be "available" or "closed".');
    }

    const { data, error } = await supabase
      .from('bays')
      .update({ 
        status, 
        updated_at: new Date().toISOString()
      })
      .eq('id', bayId)
      .select('id, status, bay_number, name, location_id')
      .single();

    if (error) {
      console.error('Error updating bay status:', error);
      throw new Error('Failed to update bay status');
    }

    if (!data) {
      throw new Error(`Bay with ID ${bayId} not found.`);
    }

    return data;
  }
} 