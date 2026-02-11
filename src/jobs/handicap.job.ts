import { supabase } from '../config/database';
import { LeagueService } from '../modules/leagues/league.service';

/**
 * Handicap Recalculation Job
 *
 * This job recalculates handicaps for all active leagues.
 * It is designed to be triggered on-demand after a week is finalized
 * (see LeagueService.finalizeWeek), but can also be run on a schedule
 * as a safety net.
 *
 * The primary trigger path is:
 *   1. Employee clicks "Finalize Week" in dashboard
 *   2. LeagueController.finalizeWeek -> LeagueService.finalizeWeek
 *   3. finalizeWeek calls recalculateHandicaps internally
 *
 * This scheduled job serves as a backup to catch any missed recalculations.
 */
export async function recalculateAllHandicaps(): Promise<void> {
  console.log('[Handicap Job] Starting handicap recalculation for all active leagues...');

  try {
    const leagueService = new LeagueService();

    // Find all active leagues with handicaps enabled
    const { data: activeLeagues, error } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('status', 'active')
      .eq('handicap_enabled', true);

    if (error) {
      console.error('[Handicap Job] Failed to fetch active leagues:', error);
      return;
    }

    if (!activeLeagues || activeLeagues.length === 0) {
      console.log('[Handicap Job] No active leagues with handicaps enabled. Skipping.');
      return;
    }

    for (const league of activeLeagues) {
      try {
        await leagueService.recalculateHandicaps(league.id);
        console.log(`[Handicap Job] Recalculated handicaps for league: ${league.name} (${league.id})`);
      } catch (leagueError: any) {
        console.error(`[Handicap Job] Error recalculating handicaps for league ${league.name}:`, leagueError.message);
      }
    }

    console.log(`[Handicap Job] Completed. Processed ${activeLeagues.length} league(s).`);
  } catch (error: any) {
    console.error('[Handicap Job] Unexpected error:', error.message);
  }
}
