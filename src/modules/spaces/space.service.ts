import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

export class SpaceService {
  async getSpaceLocationId(spaceId: string): Promise<string | null> {
    const { data } = await supabase
      .from('spaces')
      .select('location_id')
      .eq('id', spaceId)
      .single();
    return data?.location_id ?? null;
  }

  async createSpace(locationId: string, name: string, spaceNumber: number, equipment?: string) {
    if (!locationId || !name || spaceNumber === undefined) {
      throw new Error('Location ID, name, and space number are required');
    }

    const { data: existing } = await supabase
      .from('spaces')
      .select('id')
      .eq('location_id', locationId)
      .eq('space_number', spaceNumber)
      .is('deleted_at', null)
      .single();

    if (existing) {
      throw new Error(`Space number ${spaceNumber} already exists at this location`);
    }

    const { data, error } = await supabase
      .from('spaces')
      .insert({
        location_id: locationId,
        name,
        space_number: spaceNumber,
        equipment_type: equipment || 'Golf Simulator',
        status: 'available',
        league_mode_active: false,
      })
      .select('id, status, location_id, space_number, name, equipment_type, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error creating space');
      if (error.message?.includes('free_tier_space_limit_reached')) {
        const err = new Error('Your free plan is limited to 4 spaces per location. Upgrade to add more.') as Error & { statusCode?: number };
        err.statusCode = 402;
        throw err;
      }
      throw new Error('Failed to create space');
    }

    return data;
  }

  async deleteSpace(spaceId: string) {
    if (!spaceId) {
      throw new Error('Space ID is required');
    }

    // Soft delete: set deleted_at timestamp
    const { data, error } = await supabase
      .from('spaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', spaceId)
      .is('deleted_at', null)
      .select('id, location_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error deleting space');
      throw new Error('Failed to delete space');
    }

    if (!data) {
      throw new Error(`Space with ID ${spaceId} not found or already deleted`);
    }

    return { success: true, locationId: data.location_id };
  }

  async getSpacesByLocationId(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('spaces')
      .select('id, status, location_id, space_number, name, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
      .eq('location_id', locationId)
      .is('deleted_at', null);

    if (error) {
      logger.error({ err: error }, 'Error fetching spaces');
      throw new Error('Failed to fetch spaces');
    }

    return data;
  }

  async updateSpaceHeartbeat(spaceId: string, kioskIp: string | undefined) {
    if (!spaceId) {
      throw new Error('Space ID is required');
    }

    const { data, error } = await supabase
      .from('spaces')
      .update({
        last_seen: new Date().toISOString(),
        kiosk_ip: kioskIp
      })
      .eq('id', spaceId)
      .select('id, last_seen, kiosk_ip, location_id, space_number, name, status, league_mode_active, league_mode_league_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error updating space heartbeat');
      throw new Error('Failed to update space heartbeat');
    }

    if (!data) {
        throw new Error(`Space with ID ${spaceId} not found.`);
    }

    return data;
  }

  // Add: Update space status
  async updateSpaceStatus(spaceId: string, status: 'available' | 'closed') {
    if (!spaceId) {
      throw new Error('Space ID is required');
    }

    if (!['available', 'closed'].includes(status)) {
      throw new Error('Invalid status. Must be "available" or "closed".');
    }

    const { data, error } = await supabase
      .from('spaces')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', spaceId)
      .select('id, status, space_number, name, location_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error updating space status');
      throw new Error('Failed to update space status');
    }

    if (!data) {
      throw new Error(`Space with ID ${spaceId} not found.`);
    }

    return data;
  }

  // =====================================================
  // SPACE CLOSURES
  // =====================================================

  async getClosures(spaceId: string) {
    const { data, error } = await supabase
      .from('space_closures')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching space closures');
      throw new Error('Failed to fetch space closures');
    }
    return data || [];
  }

  async getClosuresByLocation(locationId: string) {
    const { data, error } = await supabase
      .from('space_closures')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching location closures');
      throw new Error('Failed to fetch location closures');
    }
    return data || [];
  }

  async createClosure(params: {
    spaceId: string;
    locationId: string;
    closureType: 'indefinite' | 'dates' | 'recurring' | 'range' | 'hours';
    dates?: string[];
    recurringDays?: number[];
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
    createdBy: string;
  }) {
    const { spaceId, locationId, closureType, dates, recurringDays, startDate, endDate, startTime, endTime, reason, createdBy } = params;

    // Insert the closure row first
    const { data, error } = await supabase
      .from('space_closures')
      .insert({
        space_id: spaceId,
        location_id: locationId,
        closure_type: closureType,
        dates: dates || null,
        recurring_days: recurringDays || null,
        start_date: startDate || null,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        reason: reason || null,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error creating space closure');
      throw new Error('Failed to create space closure');
    }

    // Only after successful insert, set spaces.status to 'closed' for indefinite closures
    if (closureType === 'indefinite') {
      await this.updateSpaceStatus(spaceId, 'closed');
    }

    return data;
  }

  async getClosureById(closureId: string) {
    const { data, error } = await supabase
      .from('space_closures')
      .select('*')
      .eq('id', closureId)
      .single();

    if (error) {
      logger.error({ err: error }, 'Error fetching closure by ID');
      return null;
    }
    return data;
  }

  async deleteClosure(closureId: string) {
    // Get the closure first to check if it's indefinite
    const { data: closure } = await supabase
      .from('space_closures')
      .select('id, space_id, closure_type')
      .eq('id', closureId)
      .single();

    if (!closure) {
      throw new Error('Closure not found');
    }

    // Count remaining indefinite closures (excluding this one) BEFORE deleting
    let shouldReopenSpace = false;
    if (closure.closure_type === 'indefinite') {
      const { count } = await supabase
        .from('space_closures')
        .select('id', { count: 'exact', head: true })
        .eq('space_id', closure.space_id)
        .eq('closure_type', 'indefinite')
        .neq('id', closureId);

      shouldReopenSpace = (count ?? 0) === 0;
    }

    const { error } = await supabase
      .from('space_closures')
      .delete()
      .eq('id', closureId);

    if (error) {
      logger.error({ err: error }, 'Error deleting space closure');
      throw new Error('Failed to delete space closure');
    }

    // If this was the last indefinite closure, reopen the space
    if (shouldReopenSpace) {
      await this.updateSpaceStatus(closure.space_id, 'available');
    }

    return { success: true, spaceId: closure.space_id };
  }

  async getActiveClosuresForSlot(spaceId: string, bookingDate: string, startTime: string, endTime: string): Promise<boolean> {
    // Check if any closure applies to this slot
    const { data: closures } = await supabase
      .from('space_closures')
      .select('*')
      .eq('space_id', spaceId);

    if (!closures || closures.length === 0) return false;

    const dateStr = bookingDate.split('T')[0]; // YYYY-MM-DD
    const { prevDateStr, todayDow, prevDow } = this.getDateContext(dateStr);

    for (const c of closures) {
      if (c.closure_type === 'indefinite') return true;

      // 1) Does the closure apply natively on the booking's date?
      if (this.closureAppliesOnDate(c, dateStr, todayDow)) {
        if (!c.start_time || !c.end_time) return true; // all-day closure
        // Overnight closures: on the native day, only the head [start_time, 24:00) applies
        const windowEnd = c.end_time < c.start_time ? '24:00' : c.end_time;
        if (startTime < windowEnd && endTime > c.start_time) return true;
      }

      // 2) Overnight tail from the previous day leaking into the booking's date
      //    Only closures with a timed window where end_time < start_time produce a tail
      if (c.start_time && c.end_time && c.end_time < c.start_time) {
        if (this.closureAppliesOnDate(c, prevDateStr, prevDow)) {
          // Tail window on today is [00:00, c.end_time)
          if (startTime < c.end_time) return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns whether a closure row is natively active on the given calendar date.
   * "Natively" means this is the day the closure's start_time is anchored to —
   * overnight tails are handled separately by the caller.
   */
  private closureAppliesOnDate(
    c: { closure_type: string; dates?: string[] | null; recurring_days?: number[] | null; start_date?: string | null; end_date?: string | null },
    dateStr: string,
    dayOfWeek: number
  ): boolean {
    switch (c.closure_type) {
      case 'indefinite':
        return true;
      case 'dates':
        return !!c.dates?.includes(dateStr);
      case 'recurring':
        if (!c.recurring_days?.includes(dayOfWeek)) return false;
        if (c.start_date && dateStr < c.start_date) return false;
        if (c.end_date && dateStr > c.end_date) return false;
        return true;
      case 'range':
        return !!(c.start_date && c.end_date && dateStr >= c.start_date && dateStr <= c.end_date);
      case 'hours': {
        if (c.dates?.includes(dateStr)) return true;
        if (c.recurring_days?.includes(dayOfWeek)) {
          if ((!c.start_date || dateStr >= c.start_date) && (!c.end_date || dateStr <= c.end_date)) return true;
        }
        if (c.start_date && c.end_date && dateStr >= c.start_date && dateStr <= c.end_date) return true;
        return false;
      }
      default:
        return false;
    }
  }

  private getDateContext(dateStr: string): { prevDateStr: string; todayDow: number; prevDow: number } {
    // Parse as UTC noon to avoid DST / timezone edge cases when stepping back a day
    const today = new Date(`${dateStr}T12:00:00Z`);
    const todayDow = today.getUTCDay();
    const prev = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const prevDateStr = prev.toISOString().split('T')[0];
    const prevDow = prev.getUTCDay();
    return { prevDateStr, todayDow, prevDow };
  }

  // =====================================================
  // LEAGUE MODE
  // =====================================================

  /**
   * Bulk activate league mode for all spaces at a location.
   */
  async activateLeagueMode(locationId: string, leagueId: string) {
    if (!locationId || !leagueId) {
      throw new Error('Location ID and League ID are required');
    }

    const { data, error } = await supabase
      .from('spaces')
      .update({
        league_mode_active: true,
        league_mode_league_id: leagueId,
        updated_at: new Date().toISOString(),
      })
      .eq('location_id', locationId)
      .select('id, space_number, name, league_mode_active, league_mode_league_id');

    if (error) {
      logger.error({ err: error }, 'Error activating league mode');
      throw new Error('Failed to activate league mode');
    }

    return data;
  }

  /**
   * Bulk deactivate league mode for all spaces at a location.
   */
  async deactivateLeagueMode(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('spaces')
      .update({
        league_mode_active: false,
        league_mode_league_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('location_id', locationId)
      .select('id, space_number, name, league_mode_active, league_mode_league_id');

    if (error) {
      logger.error({ err: error }, 'Error deactivating league mode');
      throw new Error('Failed to deactivate league mode');
    }

    return data;
  }

  /**
   * Toggle league mode for a single space.
   */
  async toggleSpaceLeagueMode(spaceId: string, active: boolean, leagueId: string | null) {
    if (!spaceId) {
      throw new Error('Space ID is required');
    }

    const { data, error } = await supabase
      .from('spaces')
      .update({
        league_mode_active: active,
        league_mode_league_id: active ? leagueId : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', spaceId)
      .select('id, space_number, name, league_mode_active, league_mode_league_id, location_id')
      .single();

    if (error) {
      logger.error({ err: error }, 'Error toggling space league mode');
      throw new Error('Failed to toggle space league mode');
    }

    if (!data) {
      throw new Error(`Space with ID ${spaceId} not found.`);
    }

    return data;
  }
}
