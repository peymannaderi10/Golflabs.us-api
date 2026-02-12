import { supabase } from '../../config/database';

export class BayService {
  async getBaysByLocationId(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('bays')
      .select('id, status, location_id, bay_number, name, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
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
      console.error('Error activating league mode:', error);
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
      console.error('Error deactivating league mode:', error);
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
      console.error('Error toggling bay league mode:', error);
      throw new Error('Failed to toggle bay league mode');
    }

    if (!data) {
      throw new Error(`Bay with ID ${bayId} not found.`);
    }

    return data;
  }
} 