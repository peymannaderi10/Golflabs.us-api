import { supabase } from '../../config/database';
import { LeagueAttendance, AttendanceSummary, AttendanceStatus } from './league.types';
import { CapacityHoldService } from '../bookings/capacity-hold.service';
import { logger } from '../../shared/utils/logger';

export class AttendanceService {
  private capacityHoldService = new CapacityHoldService();

  // =====================================================
  // Generate attendance rows
  // =====================================================

  /**
   * Create one league_attendance row per active player for a given week.
   * Idempotent — skips if rows already exist for the week.
   */
  async generateAttendanceRows(leagueId: string, weekId: string): Promise<LeagueAttendance[]> {
    // Check if rows already exist for this week
    const { data: existing } = await supabase
      .from('league_attendance')
      .select('id')
      .eq('league_week_id', weekId)
      .limit(1);

    if (existing && existing.length > 0) {
      // Rows already generated
      const { data } = await supabase
        .from('league_attendance')
        .select('*')
        .eq('league_week_id', weekId);
      return (data || []) as LeagueAttendance[];
    }

    // Get all active players for this league
    const { data: players, error: playersError } = await supabase
      .from('league_players')
      .select('id, user_id')
      .eq('league_id', leagueId)
      .eq('enrollment_status', 'active');

    if (playersError) {
      logger.error({ err: playersError }, 'Failed to fetch players for attendance generation');
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    if (!players || players.length === 0) {
      return [];
    }

    const rows = players.map((p: any) => ({
      league_id: leagueId,
      league_week_id: weekId,
      league_player_id: p.id,
      user_id: p.user_id,
      status: 'no_response' as AttendanceStatus,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('league_attendance')
      .insert(rows)
      .select();

    if (insertError) {
      logger.error({ err: insertError }, 'Failed to generate attendance rows');
      throw new Error(`Failed to generate attendance rows: ${insertError.message}`);
    }

    logger.info({ count: (inserted || []).length, weekId }, 'Generated attendance rows for week');
    return (inserted || []) as LeagueAttendance[];
  }

  // =====================================================
  // Token-based confirm / decline (email one-click)
  // =====================================================

  /**
   * Confirm attendance via email token. Returns the updated row.
   */
  async confirmAttendance(token: string): Promise<{ success: boolean; message: string; attendance?: LeagueAttendance }> {
    return this.updateByToken(token, 'confirmed');
  }

  /**
   * Decline attendance via email token.
   */
  async declineAttendance(token: string): Promise<{ success: boolean; message: string; attendance?: LeagueAttendance }> {
    return this.updateByToken(token, 'declined');
  }

  private async updateByToken(token: string, status: AttendanceStatus): Promise<{ success: boolean; message: string; attendance?: LeagueAttendance }> {
    // Look up the attendance row by token
    const { data: row, error: fetchError } = await supabase
      .from('league_attendance')
      .select('*')
      .eq('confirmation_token', token)
      .single();

    if (fetchError || !row) {
      return { success: false, message: 'Invalid or expired confirmation link.' };
    }

    if (row.locked) {
      return { success: false, message: 'Attendance has already been locked for this week.' };
    }

    const { data: updated, error: updateError } = await supabase
      .from('league_attendance')
      .update({
        status,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single();

    if (updateError) {
      return { success: false, message: 'Failed to update attendance.' };
    }

    // Live-adjust capacity hold based on updated attendance
    if (row.league_week_id) {
      const { data: week } = await supabase
        .from('league_weeks')
        .select('league_id')
        .eq('id', row.league_week_id)
        .single();

      if (week?.league_id) {
        this.liveAdjustCapacityHold(week.league_id, row.league_week_id).catch(err =>
          logger.error({ err, leagueId: week.league_id, weekId: row.league_week_id }, 'liveAdjustCapacityHold failed (non-fatal)')
        );
      }
    }

    return {
      success: true,
      message: status === 'confirmed' ? 'You\'re confirmed! See you on league night.' : 'Got it — you won\'t be attending this week.',
      attendance: updated as LeagueAttendance,
    };
  }

  // =====================================================
  // Auth-based update (from user dashboard)
  // =====================================================

  /**
   * Update attendance from the user dashboard (requires authentication).
   */
  async updateAttendance(leaguePlayerId: string, weekId: string, status: AttendanceStatus): Promise<LeagueAttendance> {
    // Check if the row is locked
    const { data: row, error: fetchError } = await supabase
      .from('league_attendance')
      .select('*')
      .eq('league_week_id', weekId)
      .eq('league_player_id', leaguePlayerId)
      .single();

    if (fetchError || !row) {
      throw new Error('Attendance record not found for this week.');
    }

    if (row.locked) {
      throw new Error('Attendance has been locked for this week.');
    }

    const { data: updated, error: updateError } = await supabase
      .from('league_attendance')
      .update({
        status,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update attendance: ${updateError.message}`);
    }

    // Live-adjust capacity hold based on updated attendance
    const { data: week } = await supabase
      .from('league_weeks')
      .select('league_id')
      .eq('id', weekId)
      .single();

    if (week?.league_id) {
      this.liveAdjustCapacityHold(week.league_id, weekId).catch(err =>
        logger.error({ err, leagueId: week.league_id, weekId }, 'liveAdjustCapacityHold failed (non-fatal)')
      );
    }

    return updated as LeagueAttendance;
  }

  // =====================================================
  // Queries
  // =====================================================

  /**
   * Get all attendance rows for a week, with player names.
   */
  async getAttendanceForWeek(weekId: string): Promise<LeagueAttendance[]> {
    const { data, error } = await supabase
      .from('league_attendance')
      .select('*, league_players(display_name, league_team_id, league_teams(team_name))')
      .eq('league_week_id', weekId)
      .order('created_at');

    if (error) {
      throw new Error(`Failed to fetch attendance: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      ...row,
      display_name: row.league_players?.display_name || 'Unknown',
      league_team_id: row.league_players?.league_team_id || null,
      team_name: row.league_players?.league_teams?.team_name || undefined,
    }));
  }

  /**
   * Get attendance summary with counts and calculated spaces needed.
   */
  async getAttendanceSummary(weekId: string, playersPerSpace: number = 2): Promise<AttendanceSummary> {
    const rows = await this.getAttendanceForWeek(weekId);

    const confirmed = rows.filter(r => r.status === 'confirmed').length;
    const declined = rows.filter(r => r.status === 'declined').length;
    const noResponse = rows.filter(r => r.status === 'no_response').length;
    const locked = rows.length > 0 && rows[0].locked;

    const spacesNeeded = confirmed > 0 ? Math.ceil(confirmed / playersPerSpace) : 0;

    return {
      weekId,
      totalPlayers: rows.length,
      confirmed,
      declined,
      noResponse,
      spacesNeeded,
      locked,
    };
  }

  /**
   * Get a player's attendance status across all weeks for a league.
   */
  async getPlayerAttendance(userId: string, leagueId: string): Promise<LeagueAttendance[]> {
    const { data, error } = await supabase
      .from('league_attendance')
      .select('*, league_weeks(week_number, date, status)')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .order('created_at');

    if (error) {
      throw new Error(`Failed to fetch player attendance: ${error.message}`);
    }

    return (data || []) as LeagueAttendance[];
  }

  // =====================================================
  // Lock & Adjust
  // =====================================================

  /**
   * Lock attendance for a week — no further changes allowed.
   */
  async lockAttendance(weekId: string): Promise<void> {
    const { error } = await supabase
      .from('league_attendance')
      .update({ locked: true, updated_at: new Date().toISOString() })
      .eq('league_week_id', weekId);

    if (error) {
      logger.error({ err: error }, 'Failed to lock attendance');
      throw new Error(`Failed to lock attendance: ${error.message}`);
    }

    logger.info({ weekId }, 'Attendance locked for week');
  }

  /**
   * Live-adjust capacity hold as players respond (confirm/decline).
   * Counts confirmed + no_response as potential attendees (they might still show up).
   * Only reduces the hold, never increases beyond the original.
   */
  async liveAdjustCapacityHold(leagueId: string, weekId: string): Promise<void> {
    try {
      const { data: league } = await supabase
        .from('leagues')
        .select('attendance_auto_adjust, players_per_space, capacity_hold_type, capacity_hold_value, location_id')
        .eq('id', leagueId)
        .single();

      if (!league || !league.attendance_auto_adjust) return;

      const playersPerSpace = league.players_per_space || 2;
      const rows = await this.getAttendanceForWeek(weekId);

      // Count confirmed + no_response as potential attendees
      const potentialAttendees = rows.filter(r => r.status === 'confirmed' || r.status === 'no_response').length;
      const spacesNeeded = potentialAttendees > 0 ? Math.ceil(potentialAttendees / playersPerSpace) : 0;

      // Get total spaces at location
      const { data: spaces } = await supabase
        .from('spaces')
        .select('id')
        .eq('location_id', league.location_id)
        .is('deleted_at', null);

      const totalSpaces = spaces?.length || 0;

      // Compute original reserved spaces
      let originalReservedSpaces: number;
      switch (league.capacity_hold_type) {
        case 'all_spaces': originalReservedSpaces = totalSpaces; break;
        case 'num_spaces': originalReservedSpaces = league.capacity_hold_value; break;
        default: originalReservedSpaces = totalSpaces;
      }

      if (potentialAttendees === 0) {
        await this.suspendHoldForWeek(weekId);
        logger.info({ weekId, leagueId }, 'Live-adjust: suspended hold (0 potential attendees)');
        return;
      }

      // Only reduce, never increase beyond original
      if (spacesNeeded < originalReservedSpaces) {
        await this.updateHoldForWeek(weekId, spacesNeeded);
        logger.info({ weekId, leagueId, spacesNeeded, originalReservedSpaces }, 'Live-adjust: reduced hold');
      }
    } catch (err) {
      logger.error({ err, leagueId, weekId }, 'Error in live capacity adjustment');
      // Don't throw — this is a best-effort optimization
    }
  }

  /**
   * Final capacity adjustment at cutoff time.
   * Only counts confirmed players (no_response = not coming).
   * Only reduces the hold, never increases beyond the original.
   */
  async adjustCapacityHold(leagueId: string, weekId: string): Promise<{ adjusted: boolean; spacesNeeded: number; originalSpaces: number }> {
    // 1. Get the league config
    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .select('players_per_space, capacity_hold_type, capacity_hold_value, location_id')
      .eq('id', leagueId)
      .single();

    if (leagueError || !league) {
      throw new Error('League not found for capacity adjustment.');
    }

    const playersPerSpace = league.players_per_space || 2;

    // 2. Get the attendance summary
    const summary = await this.getAttendanceSummary(weekId, playersPerSpace);

    // 3. Get the total number of spaces at the location
    const { data: spaces } = await supabase
      .from('spaces')
      .select('id')
      .eq('location_id', league.location_id)
      .is('deleted_at', null);

    const totalSpaces = spaces?.length || 0;

    // 4. Compute original reserved spaces based on hold config
    let originalReservedSpaces: number;
    switch (league.capacity_hold_type) {
      case 'all_spaces':
        originalReservedSpaces = totalSpaces;
        break;
      case 'num_spaces':
        originalReservedSpaces = league.capacity_hold_value;
        break;
      case 'pct_capacity':
        originalReservedSpaces = Math.ceil(totalSpaces * (league.capacity_hold_value / 100));
        break;
      default:
        originalReservedSpaces = totalSpaces;
    }

    // 5. If 0 confirmed, suspend the hold entirely
    if (summary.confirmed === 0) {
      await this.suspendHoldForWeek(weekId);
      logger.info({ weekId }, 'Suspended hold for week - 0 confirmed players');
      return { adjusted: true, spacesNeeded: 0, originalSpaces: originalReservedSpaces };
    }

    // 6. Compare: only reduce, never increase
    const spacesNeeded = summary.spacesNeeded;
    if (spacesNeeded >= originalReservedSpaces) {
      logger.info({ weekId, spacesNeeded, originalReservedSpaces }, 'Hold for week unchanged - spaces needed >= original');
      return { adjusted: false, spacesNeeded, originalSpaces: originalReservedSpaces };
    }

    // 7. Reduce the hold for this specific week
    await this.updateHoldForWeek(weekId, spacesNeeded);
    logger.info({ weekId, originalReservedSpaces, spacesNeeded }, 'Adjusted hold for week');
    return { adjusted: true, spacesNeeded, originalSpaces: originalReservedSpaces };
  }

  // =====================================================
  // Team-specific
  // =====================================================

  /**
   * Get attendance summary per team for a week.
   */
  async getTeamAttendanceSummary(weekId: string, teamId: string): Promise<{ confirmed: number; total: number }> {
    const rows = await this.getAttendanceForWeek(weekId);
    const teamRows = rows.filter(r => r.league_team_id === teamId);
    const confirmed = teamRows.filter(r => r.status === 'confirmed').length;
    return { confirmed, total: teamRows.length };
  }

  // =====================================================
  // Private helpers
  // =====================================================

  /**
   * Suspend a hold row for a specific week (0 confirmed).
   */
  private async suspendHoldForWeek(weekId: string): Promise<void> {
    const { error } = await supabase
      .from('capacity_holds')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('league_week_id', weekId)
      .eq('status', 'active');

    if (error) {
      logger.error({ err: error }, 'Failed to suspend hold for week');
    }
  }

  /**
   * Update a specific week's hold to a reduced number of spaces.
   */
  private async updateHoldForWeek(weekId: string, spacesNeeded: number): Promise<void> {
    const { error } = await supabase
      .from('capacity_holds')
      .update({
        hold_type: 'num_spaces',
        hold_value: spacesNeeded,
        updated_at: new Date().toISOString(),
      })
      .eq('league_week_id', weekId)
      .eq('status', 'active');

    if (error) {
      logger.error({ err: error }, 'Failed to update hold for week');
      throw new Error(`Failed to update hold: ${error.message}`);
    }
  }
}
