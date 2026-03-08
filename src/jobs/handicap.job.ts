import { supabase } from '../config/database';
import { LeagueService } from '../modules/leagues/league.service';
import { logger } from '../shared/utils/logger';

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
  logger.info('Starting handicap recalculation for all active leagues');

  try {
    const leagueService = new LeagueService();

    // Find all active leagues with handicaps enabled
    const { data: activeLeagues, error } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('status', 'active')
      .eq('handicap_enabled', true);

    if (error) {
      logger.error({ err: error }, 'Failed to fetch active leagues');
      return;
    }

    if (!activeLeagues || activeLeagues.length === 0) {
      logger.info('No active leagues with handicaps enabled, skipping');
      return;
    }

    for (const league of activeLeagues) {
      try {
        await leagueService.recalculateHandicaps(league.id);
        logger.info({ leagueId: league.id, leagueName: league.name }, 'Recalculated handicaps for league');
      } catch (leagueError: any) {
        logger.error({ err: leagueError, leagueId: league.id, leagueName: league.name }, 'Error recalculating handicaps for league');
      }
    }

    logger.info({ count: activeLeagues.length }, 'Handicap recalculation completed');
  } catch (error: any) {
    logger.error({ err: error }, 'Unexpected handicap job error');
  }
}
