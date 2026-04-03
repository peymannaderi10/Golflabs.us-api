import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

export class BayService {
  async getBayLocationId(bayId: string): Promise<string | null> {
    const { data } = await supabase
      .from('bays')
      .select('location_id')
      .eq('id', bayId)
      .single();
    return data?.location_id ?? null;
  }

  async createBay(locationId: string, name: string, bayNumber: number, equipment?: string) {
    if (!locationId || !name || bayNumber === undefined) {
      throw new Error('Location ID, name, and bay number are required');
    }

    const { data: existing } = await supabase
      .from('bays')
      .select('id')
      .eq('location_id', locationId)
      .eq('bay_number', bayNumber)
      .is('deleted_at', null)
      .single();

    if (existing) {
      throw new Error(`Bay number ${bayNumber} already exists at this location`);
    }

    const { data, error } = await supabase
      .from('bays')
      .insert({
        location_id: locationId,
        name,
        bay_number: bayNumber,
        equipment_type: equipment || 'Golf Simulator',
        status: 'available',
        league_mode_active: false,
      })
      .select('id, status, location_id, bay_number, name, equipment_type, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error creating bay');
      throw new Error('Failed to create bay');
    }

    return data;
  }

  async deleteBay(bayId: string) {
    if (!bayId) {
      throw new Error('Bay ID is required');
    }

    // Soft delete: set deleted_at timestamp
    const { data, error } = await supabase
      .from('bays')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bayId)
      .is('deleted_at', null)
      .select('id, location_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error deleting bay');
      throw new Error('Failed to delete bay');
    }

    if (!data) {
      throw new Error(`Bay with ID ${bayId} not found or already deleted`);
    }

    return { success: true, locationId: data.location_id };
  }

  async getBaysByLocationId(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('bays')
      .select('id, status, location_id, bay_number, name, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
      .eq('location_id', locationId)
      .is('deleted_at', null);

    if (error) {
      logger.error({ err: error }, 'Error fetching bays');
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
      .select('id, last_seen, kiosk_ip, location_id, bay_number, name, status, league_mode_active, league_mode_league_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error updating bay heartbeat');
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
      logger.error({ err: error }, 'Error updating bay status');
      throw new Error('Failed to update bay status');
    }

    if (!data) {
      throw new Error(`Bay with ID ${bayId} not found.`);
    }

    return data;
  }

  // =====================================================
  // LEAGUE MODE
  // =====================================================

  /**
   * Bulk activate league mode for all bays at a location.
   */
  async activateLeagueMode(locationId: string, leagueId: string) {
    if (!locationId || !leagueId) {
      throw new Error('Location ID and League ID are required');
    }

    const { data, error } = await supabase
      .from('bays')
      .update({
        league_mode_active: true,
        league_mode_league_id: leagueId,
        updated_at: new Date().toISOString(),
      })
      .eq('location_id', locationId)
      .select('id, bay_number, name, league_mode_active, league_mode_league_id');

    if (error) {
      logger.error({ err: error }, 'Error activating league mode');
      throw new Error('Failed to activate league mode');
    }

    return data;
  }

  /**
   * Bulk deactivate league mode for all bays at a location.
   */
  async deactivateLeagueMode(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('bays')
      .update({
        league_mode_active: false,
        league_mode_league_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('location_id', locationId)
      .select('id, bay_number, name, league_mode_active, league_mode_league_id');

    if (error) {
      logger.error({ err: error }, 'Error deactivating league mode');
      throw new Error('Failed to deactivate league mode');
    }

    return data;
  }

  /**
   * Toggle league mode for a single bay.
   */
  async toggleBayLeagueMode(bayId: string, active: boolean, leagueId: string | null) {
    if (!bayId) {
      throw new Error('Bay ID is required');
    }

    const { data, error } = await supabase
      .from('bays')
      .update({
        league_mode_active: active,
        league_mode_league_id: active ? leagueId : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bayId)
      .select('id, bay_number, name, league_mode_active, league_mode_league_id, location_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error toggling bay league mode');
      throw new Error('Failed to toggle bay league mode');
    }

    if (!data) {
      throw new Error(`Bay with ID ${bayId} not found.`);
    }

    return data;
  }
} 