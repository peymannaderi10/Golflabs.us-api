import { LeagueService } from '../modules/leagues/league.service';

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
      console.log(`[league-deadline] Disqualified ${result.disqualified.length} team(s):`, result.disqualified);
    }
  } catch (error) {
    console.error('[league-deadline] Error processing team deadlines:', error);
  }
}
