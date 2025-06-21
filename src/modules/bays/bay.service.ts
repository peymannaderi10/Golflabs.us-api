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
} 