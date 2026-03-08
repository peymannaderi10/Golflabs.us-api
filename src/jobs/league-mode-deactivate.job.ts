import { supabase } from '../config/database';
import { logger } from '../shared/utils/logger';

/**
 * Auto-deactivate league mode on bays after the league's end time + buffer.
 * 
 * Checks all bays where league_mode_active = true, looks up the associated
 * league's end_time and buffer_after_mins, and deactivates if the current
 * time has passed the league end time + buffer.
 */
export async function autoDeactivateLeagueMode() {
  try {
    // Find all bays that are currently in league mode
    const { data: activeBays, error: baysError } = await supabase
      .from('bays')
      .select('id, location_id, league_mode_league_id')
      .eq('league_mode_active', true)
      .not('league_mode_league_id', 'is', null);

    if (baysError || !activeBays || activeBays.length === 0) {
      return; // No active league mode bays
    }

    // Get unique league IDs
    const leagueIds = [...new Set(activeBays.map(b => b.league_mode_league_id).filter(Boolean))];

    if (leagueIds.length === 0) return;

    // Fetch league details
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id, end_time, buffer_after_mins, location_id')
      .in('id', leagueIds);

    if (leaguesError || !leagues) {
      logger.error({ err: leaguesError }, 'Auto-deactivate: Failed to fetch leagues');
      return;
    }

    const now = new Date();

    for (const league of leagues) {
      // Parse the league end time (stored as HH:MM)
      const [endHour, endMin] = (league.end_time || '21:00').split(':').map(Number);
      const bufferMins = league.buffer_after_mins || 0;

      // Calculate the deactivation time for today
      const deactivateTime = new Date();
      deactivateTime.setHours(endHour, endMin + bufferMins, 0, 0);

      if (now > deactivateTime) {
        // Current time is past the league end + buffer, deactivate
        logger.info({ leagueId: league.id, locationId: league.location_id, endTime: league.end_time, bufferMins }, 'Auto-deactivating league mode');

        const { error: updateError } = await supabase
          .from('bays')
          .update({
            league_mode_active: false,
            league_mode_league_id: null,
            updated_at: now.toISOString(),
          })
          .eq('league_mode_league_id', league.id);

        if (updateError) {
          logger.error({ err: updateError, leagueId: league.id }, 'Auto-deactivate: Failed to update bays');
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Auto-deactivate league mode job error');
  }
}
