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
} 