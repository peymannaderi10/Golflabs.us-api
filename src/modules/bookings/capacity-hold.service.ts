import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { createISOTimestamp } from '../../shared/utils/date.utils';

export type HoldType = 'all_spaces' | 'num_spaces' | 'pct_capacity';
export type HoldStatus = 'active' | 'suspended' | 'released';

export interface CapacityHold {
  id: string;
  league_id: string;
  league_week_id: string | null;
  location_id: string;
  hold_date: string;       // YYYY-MM-DD
  start_time: string;      // HH:MM
  end_time: string;        // HH:MM
  hold_type: HoldType;
  hold_value: number;
  buffer_before_mins: number;
  buffer_after_mins: number;
  status: HoldStatus;
  created_at: string;
  updated_at: string;
  held_space_ids?: string[] | null;
  // Joined fields
  league_name?: string;
}

export interface HoldConfig {
  holdType: HoldType;
  holdValue: number;
  bufferBeforeMins: number;
  bufferAfterMins: number;
}

export class CapacityHoldService {

  /**
   * Generate capacity holds for all weeks of a league.
   * Called when a league is created.
   *
   * Smart initial hold: instead of blindly using `all_spaces`, calculate
   * the actual spaces needed based on max_players / players_per_space.
   * If that exceeds total spaces at the location, cap at all spaces.
   */
  async generateHoldsForLeague(
    leagueId: string,
    locationId: string,
    startTime: string,
    endTime: string,
    weeks: { id: string; date: string }[],
    config: HoldConfig,
    leagueContext?: { maxPlayers: number; playersPerSpace: number }
  ): Promise<void> {
    if (weeks.length === 0) return;

    // Get all spaces at the location sorted by space_number
    const { data: allSpaces } = await supabase
      .from('spaces')
      .select('id, space_number')
      .eq('location_id', locationId)
      .is('deleted_at', null)
      .order('space_number');

    const totalSpaces = allSpaces?.length || 0;
    if (totalSpaces === 0) return;

    let holdType = config.holdType;
    let holdValue = config.holdValue;
    let spacesNeeded = totalSpaces;

    // Smart initial hold: calculate actual spaces needed from league capacity
    if (leagueContext && leagueContext.maxPlayers > 0 && leagueContext.playersPerSpace > 0) {
      spacesNeeded = Math.ceil(leagueContext.maxPlayers / leagueContext.playersPerSpace);

      if (spacesNeeded < totalSpaces) {
        holdType = 'num_spaces';
        holdValue = spacesNeeded;
        logger.info({ leagueId, spacesNeeded, totalSpaces, maxPlayers: leagueContext.maxPlayers, playersPerSpace: leagueContext.playersPerSpace }, 'Smart hold: reserving calculated spaces instead of all');
      } else {
        holdType = 'all_spaces';
        holdValue = 100;
        logger.info({ leagueId, spacesNeeded, totalSpaces }, 'Smart hold: reserving all spaces');
      }
    }

    // Get location timezone for booking overlap checks
    const { data: location } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();
    const timezone = location?.timezone || 'America/New_York';

    const rows: any[] = [];

    for (const week of weeks) {
      let heldSpaceIds: string[] | null = null;

      if (holdType === 'num_spaces') {
        // Find which spaces have bookings during this league window (including buffers)
        const windowStart = new Date(createISOTimestamp(week.date, startTime, timezone));
        const windowEnd = new Date(createISOTimestamp(week.date, endTime, timezone));
        windowStart.setMinutes(windowStart.getMinutes() - config.bufferBeforeMins);
        windowEnd.setMinutes(windowEnd.getMinutes() + config.bufferAfterMins);

        const { data: overlappingBookings } = await supabase
          .from('bookings')
          .select('space_id')
          .eq('location_id', locationId)
          .in('status', ['confirmed', 'reserved'])
          .lt('start_time', windowEnd.toISOString())
          .gt('end_time', windowStart.toISOString());

        const bookedSpaceIds = new Set((overlappingBookings || []).map((b: any) => b.space_id));

        // Prefer free spaces first, then fill with booked ones if needed
        const freeSpaces = (allSpaces || []).filter(s => !bookedSpaceIds.has(s.id));
        const bookedSpaces = (allSpaces || []).filter(s => bookedSpaceIds.has(s.id));
        const picked = [...freeSpaces, ...bookedSpaces].slice(0, spacesNeeded);
        heldSpaceIds = picked.map(s => s.id);
      } else if (holdType === 'all_spaces') {
        heldSpaceIds = (allSpaces || []).map(s => s.id);
      }

      rows.push({
        league_id: leagueId,
        league_week_id: week.id,
        location_id: locationId,
        hold_date: week.date,
        start_time: startTime,
        end_time: endTime,
        hold_type: holdType,
        hold_value: holdValue,
        buffer_before_mins: config.bufferBeforeMins,
        buffer_after_mins: config.bufferAfterMins,
        held_space_ids: heldSpaceIds,
        status: 'active' as HoldStatus,
      });
    }

    const { error } = await supabase
      .from('capacity_holds')
      .insert(rows);

    if (error) {
      logger.error({ err: error }, 'Failed to generate capacity holds');
      throw new Error(`Failed to generate capacity holds: ${error.message}`);
    }

    logger.info({ count: rows.length, leagueId, holdType, holdValue }, 'Generated capacity holds for league');
  }

  /**
   * Release all holds for a league (when cancelled).
   */
  async releaseHoldsForLeague(leagueId: string): Promise<void> {
    const { error } = await supabase
      .from('capacity_holds')
      .update({ status: 'released', updated_at: new Date().toISOString() })
      .eq('league_id', leagueId)
      .eq('status', 'active');

    if (error) {
      logger.error({ err: error }, 'Failed to release holds for league');
      throw new Error(`Failed to release holds: ${error.message}`);
    }
  }

  /**
   * Suspend a single hold (e.g. holiday skip).
   */
  async suspendHold(holdId: string): Promise<void> {
    const { error } = await supabase
      .from('capacity_holds')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', holdId);

    if (error) {
      throw new Error(`Failed to suspend hold: ${error.message}`);
    }
  }

  /**
   * Re-activate a suspended hold.
   */
  async activateHold(holdId: string): Promise<void> {
    const { error } = await supabase
      .from('capacity_holds')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', holdId);

    if (error) {
      throw new Error(`Failed to activate hold: ${error.message}`);
    }
  }

  /**
   * Get active holds for a specific date and location.
   * Used by the booking engine to check availability.
   */
  async getHoldsForDate(locationId: string, date: string): Promise<CapacityHold[]> {
    const { data, error } = await supabase
      .from('capacity_holds')
      .select('*, leagues(name)')
      .eq('location_id', locationId)
      .eq('hold_date', date)
      .eq('status', 'active');

    if (error) {
      logger.error({ err: error }, 'Failed to fetch capacity holds');
      return [];
    }

    return (data || []).map((h: any) => ({
      ...h,
      league_name: h.leagues?.name || undefined,
    }));
  }

  /**
   * Get all holds for a league (admin view).
   */
  async getHoldsForLeague(leagueId: string): Promise<CapacityHold[]> {
    const { data, error } = await supabase
      .from('capacity_holds')
      .select('*')
      .eq('league_id', leagueId)
      .order('hold_date');

    if (error) {
      throw new Error(`Failed to fetch holds for league: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Update the hold configuration for all future active holds of a league.
   */
  async updateHoldConfig(leagueId: string, config: HoldConfig): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('capacity_holds')
      .update({
        hold_type: config.holdType,
        hold_value: config.holdValue,
        buffer_before_mins: config.bufferBeforeMins,
        buffer_after_mins: config.bufferAfterMins,
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('status', 'active')
      .gte('hold_date', today);

    if (error) {
      throw new Error(`Failed to update hold config: ${error.message}`);
    }
  }

  /**
   * Check if a requested booking time overlaps with any active capacity hold.
   * Returns the hold if blocked, null if booking is allowed.
   *
   * @param locationId  Location UUID
   * @param date        YYYY-MM-DD
   * @param startTime   HH:MM (24h) of the booking start
   * @param endTime     HH:MM (24h) of the booking end
   * @param totalSpaces   Total number of spaces at the location (for num_spaces / pct_capacity)
   * @param existingBookingsInWindow  Count of non-league bookings already in this window
   */
  async checkHoldConflict(
    locationId: string,
    date: string,
    startTime: string,
    endTime: string,
    totalSpaces: number,
    existingBookingsInWindow: number = 0
  ): Promise<CapacityHold | null> {
    const holds = await this.getHoldsForDate(locationId, date);

    for (const hold of holds) {
      // Calculate effective hold window with buffers
      const holdStart = this.subtractMinutes(hold.start_time, hold.buffer_before_mins);
      const holdEnd = this.addMinutes(hold.end_time, hold.buffer_after_mins);

      // Check overlap: booking overlaps hold if booking_start < hold_end AND booking_end > hold_start
      if (startTime < holdEnd && endTime > holdStart) {
        // Determine if this hold blocks the booking
        if (hold.hold_type === 'all_spaces') {
          return hold; // All spaces blocked
        }

        if (hold.hold_type === 'num_spaces') {
          // hold_value = number of spaces reserved for league
          const publicSpacesAvailable = totalSpaces - hold.hold_value;
          if (existingBookingsInWindow >= publicSpacesAvailable) {
            return hold; // No more public spaces available
          }
        }

        if (hold.hold_type === 'pct_capacity') {
          // hold_value = percentage of spaces reserved (e.g. 75)
          const reservedSpaces = Math.ceil(totalSpaces * (hold.hold_value / 100));
          const publicSpacesAvailable = totalSpaces - reservedSpaces;
          if (existingBookingsInWindow >= publicSpacesAvailable) {
            return hold;
          }
        }
      }
    }

    return null; // No conflict
  }

  /**
   * Get today's active hold for a location (for dashboard "League Night" detection).
   */
  async getTodaysHold(locationId: string): Promise<CapacityHold | null> {
    const today = new Date().toISOString().split('T')[0];
    const holds = await this.getHoldsForDate(locationId, today);
    return holds.length > 0 ? holds[0] : null;
  }

  // --- Helpers ---

  private subtractMinutes(time: string, minutes: number): string {
    if (minutes <= 0) return time;
    const [h, m] = time.split(':').map(Number);
    const totalMins = h * 60 + m - minutes;
    const newH = Math.max(0, Math.floor(totalMins / 60));
    const newM = Math.max(0, totalMins % 60);
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }

  private addMinutes(time: string, minutes: number): string {
    if (minutes <= 0) return time;
    const [h, m] = time.split(':').map(Number);
    const totalMins = h * 60 + m + minutes;
    const newH = Math.min(23, Math.floor(totalMins / 60));
    const newM = totalMins % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }
}
