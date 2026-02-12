import { supabase } from '../../config/database';
import { LeagueAttendance, AttendanceSummary, AttendanceStatus } from './league.types';
import { CapacityHoldService } from '../bookings/capacity-hold.service';

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
      console.error('Failed to fetch players for attendance generation:', playersError);
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
      console.error('Failed to generate attendance rows:', insertError);
      throw new Error(`Failed to generate attendance rows: ${insertError.message}`);
    }

    console.log(`Generated ${(inserted || []).length} attendance rows for week ${weekId}`);
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
   * Get attendance summary with counts and calculated bays needed.
   */
  async getAttendanceSummary(weekId: string, playersPerBay: number = 2): Promise<AttendanceSummary> {
    const rows = await this.getAttendanceForWeek(weekId);

    const confirmed = rows.filter(r => r.status === 'confirmed').length;
    const declined = rows.filter(r => r.status === 'declined').length;
    const noResponse = rows.filter(r => r.status === 'no_response').length;
    const locked = rows.length > 0 && rows[0].locked;

    const baysNeeded = confirmed > 0 ? Math.ceil(confirmed / playersPerBay) : 0;

    return {
      weekId,
      totalPlayers: rows.length,
      confirmed,
      declined,
      noResponse,
      baysNeeded,
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
      console.error('Failed to lock attendance:', error);
      throw new Error(`Failed to lock attendance: ${error.message}`);
    }

    console.log(`Attendance locked for week ${weekId}`);
  }

  /**
   * Adjust capacity hold based on confirmed attendance.
   * Only called when attendance_auto_adjust = true.
   *
   * Logic:
   * 1. Get confirmed count and compute bays_needed = ceil(confirmed / players_per_bay)
   * 2. Compare with original hold — only REDUCE, never increase
   * 3. If confirmed === 0, suspend the hold entirely
   * 4. If bays_needed >= original reserved bays, leave unchanged
   */
  async adjustCapacityHold(leagueId: string, weekId: string): Promise<{ adjusted: boolean; baysNeeded: number; originalBays: number }> {
    // 1. Get the league config
    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .select('players_per_bay, capacity_hold_type, capacity_hold_value, location_id')
      .eq('id', leagueId)
      .single();

    if (leagueError || !league) {
      throw new Error('League not found for capacity adjustment.');
    }

    const playersPerBay = league.players_per_bay || 2;

    // 2. Get the attendance summary
    const summary = await this.getAttendanceSummary(weekId, playersPerBay);

    // 3. Get the total number of bays at the location
    const { data: bays } = await supabase
      .from('bays')
      .select('id')
      .eq('location_id', league.location_id);

    const totalBays = bays?.length || 0;

    // 4. Compute original reserved bays based on hold config
    let originalReservedBays: number;
    switch (league.capacity_hold_type) {
      case 'all_bays':
        originalReservedBays = totalBays;
        break;
      case 'num_bays':
        originalReservedBays = league.capacity_hold_value;
        break;
      case 'pct_capacity':
        originalReservedBays = Math.ceil(totalBays * (league.capacity_hold_value / 100));
        break;
      default:
        originalReservedBays = totalBays;
    }

    // 5. If 0 confirmed, suspend the hold entirely
    if (summary.confirmed === 0) {
      await this.suspendHoldForWeek(weekId);
      console.log(`Suspended hold for week ${weekId} — 0 confirmed players.`);
      return { adjusted: true, baysNeeded: 0, originalBays: originalReservedBays };
    }

    // 6. Compare: only reduce, never increase
    const baysNeeded = summary.baysNeeded;
    if (baysNeeded >= originalReservedBays) {
      console.log(`Hold for week ${weekId} unchanged — ${baysNeeded} bays needed >= ${originalReservedBays} original.`);
      return { adjusted: false, baysNeeded, originalBays: originalReservedBays };
    }

    // 7. Reduce the hold for this specific week
    await this.updateHoldForWeek(weekId, baysNeeded);
    console.log(`Adjusted hold for week ${weekId}: ${originalReservedBays} -> ${baysNeeded} bays.`);
    return { adjusted: true, baysNeeded, originalBays: originalReservedBays };
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
      console.error('Failed to suspend hold for week:', error);
    }
  }

  /**
   * Update a specific week's hold to a reduced number of bays.
   */
  private async updateHoldForWeek(weekId: string, baysNeeded: number): Promise<void> {
    const { error } = await supabase
      .from('capacity_holds')
      .update({
        hold_type: 'num_bays',
        hold_value: baysNeeded,
        updated_at: new Date().toISOString(),
      })
      .eq('league_week_id', weekId)
      .eq('status', 'active');

    if (error) {
      console.error('Failed to update hold for week:', error);
      throw new Error(`Failed to update hold: ${error.message}`);
    }
  }
}
