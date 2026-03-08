import { LeagueService } from '../modules/leagues/league.service';
import { logger } from '../shared/utils/logger';

const leagueService = new LeagueService();

/**
 * Scheduled job: Process team league deadlines.
 * 
 * Runs every 5 minutes and checks for team leagues where:
 * - The league start time has passed
 * - Teams still have unpaid members
 * 
 * Unpaid teams are automatically disqualified and paid members are refunded.
 */
export async function processTeamDeadlines(): Promise<void> {
  try {
    const result = await leagueService.processTeamDeadlines();

    if (result.disqualified.length > 0) {
      logger.info({ count: result.disqualified.length, disqualified: result.disqualified }, 'Disqualified teams');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error processing team deadlines');
  }
}
