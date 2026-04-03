import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { calculateNetScore } from './handicap.utils';
import {
  League,
  LeagueWeek,
  PrizePoolConfig,
  SubmitScoreRequest,
  SubmitScoreResult,
  StandingWithPlayer,
} from './league.types';
import { LeagueCourseService } from './league-course.service';
import { LeagueStandingsService } from './league-standings.service';
import { LeaguePrizeService } from './league-prize.service';

export class LeagueScoringService {

  constructor(
    private standingsService: LeagueStandingsService,
    private prizeService: LeaguePrizeService,
    private courseService: LeagueCourseService
  ) {}

  private async getLeague(leagueId: string): Promise<League> {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .is('deleted_at', null)
      .single();
    if (error || !data) throw new Error(`League not found: ${error?.message}`);
    return data;
  }

  async getWeeks(leagueId: string): Promise<LeagueWeek[]> {
    const { data, error } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', leagueId)
      .order('week_number');

    if (error) {
      throw new Error(`Failed to fetch weeks: ${error.message}`);
    }

    return data || [];
  }

  async activateWeek(leagueId: string, weekId: string): Promise<LeagueWeek> {
    // Set the week to 'active'
    const { data, error } = await supabase
      .from('league_weeks')
      .update({ status: 'active' })
      .eq('id', weekId)
      .eq('league_id', leagueId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to activate week: ${error?.message}`);
    }

    // Update current_week on the league
    await supabase
      .from('leagues')
      .update({ current_week: data.week_number })
      .eq('id', leagueId);

    return data;
  }

  async finalizeWeek(leagueId: string, weekId: string): Promise<{ standings: StandingWithPlayer[]; payouts?: any[] }> {
    // Recalculate standings first (before marking as finalized)
    await this.standingsService.recalculateStandings(leagueId);

    const league = await this.getLeague(leagueId);

    // Recalculate handicaps
    if (league.handicap_enabled) {
      await this.standingsService.recalculateHandicaps(leagueId, weekId);
    }

    // For team leagues, also calculate team scores for this week
    if (league.format === 'team') {
      try {
        await this.standingsService.recalculateTeamStandings(leagueId);
      } catch (teamError: any) {
        logger.error({ err: teamError }, 'Error recalculating team standings');
      }
    }

    // Generate weekly prize payouts if prize pool is enabled
    let payouts: any[] | undefined;
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;
    if (prizeConfig?.enabled && prizeConfig.buyInPerSession > 0) {
      try {
        payouts = await this.prizeService.generateWeekPayouts(leagueId, weekId);
      } catch (payoutError: any) {
        logger.error({ err: payoutError, weekId }, 'Error generating payouts for week');
      }
    }

    // Mark week as finalized LAST — after all dependent operations succeed
    const { error: weekError } = await supabase
      .from('league_weeks')
      .update({ status: 'finalized' })
      .eq('id', weekId)
      .eq('league_id', leagueId);

    if (weekError) {
      throw new Error(`Failed to finalize week: ${weekError.message}`);
    }

    const standings = await this.standingsService.getStandings(leagueId);
    return { standings, payouts };
  }

  async validateScoreSubmission(data: SubmitScoreRequest): Promise<void> {
    const { leagueWeekId, leaguePlayerId, holeNumber, strokes } = data;

    if (!leagueWeekId || !leaguePlayerId || !holeNumber || strokes === undefined) {
      throw new Error('Missing required fields: leagueWeekId, leaguePlayerId, holeNumber, strokes');
    }

    if (!Number.isInteger(strokes) || strokes < 1 || strokes > 20) {
      throw new Error('Strokes must be an integer between 1 and 20');
    }

    if (!Number.isInteger(holeNumber) || holeNumber < 1) {
      throw new Error('Hole number must be a positive integer');
    }

    const { data: week, error: weekError } = await supabase
      .from('league_weeks')
      .select('id, status, league_id')
      .eq('id', leagueWeekId)
      .single();

    if (weekError || !week) {
      throw new Error('Week not found');
    }

    if (week.status !== 'active') {
      throw new Error(`Cannot submit scores for a week with status '${week.status}'. Week must be active.`);
    }

    const league = await this.getLeague(week.league_id);
    if (holeNumber > league.num_holes) {
      throw new Error(`Hole number ${holeNumber} exceeds league hole count (${league.num_holes})`);
    }

    const { data: player, error: playerError } = await supabase
      .from('league_players')
      .select('id, enrollment_status')
      .eq('id', leaguePlayerId)
      .single();

    if (playerError || !player) {
      throw new Error('Player not found');
    }

    if (player.enrollment_status !== 'active') {
      throw new Error(`Player enrollment status is '${player.enrollment_status}'. Must be active to submit scores.`);
    }
  }

  async submitScore(data: SubmitScoreRequest): Promise<SubmitScoreResult> {
    const { leagueWeekId, leaguePlayerId, holeNumber, strokes, bayId, enteredVia = 'kiosk' } = data;

    await this.validateScoreSubmission(data);

    const { data: result, error } = await supabase.rpc('submit_league_score', {
      p_league_week_id: leagueWeekId,
      p_league_player_id: leaguePlayerId,
      p_hole_number: holeNumber,
      p_strokes: strokes,
      p_bay_id: bayId || null,
      p_entered_via: enteredVia,
    });

    if (error || !result) {
      throw new Error(`Failed to submit score: ${error?.message}`);
    }

    return result as SubmitScoreResult;
  }

  async submitScoresBulk(leagueId: string, data: { leagueWeekId: string; leaguePlayerId: string; scores: { holeNumber: number; strokes: number }[]; enteredVia?: string }): Promise<SubmitScoreResult> {
    const { leagueWeekId, leaguePlayerId, scores, enteredVia = 'employee' } = data;

    // Validate player and week status
    await this.validateScoreSubmission({ leagueWeekId, leaguePlayerId, holeNumber: 1, strokes: 1 });

    // Validate each score entry
    const league = await this.getLeague(leagueId);
    for (const { holeNumber, strokes } of scores) {
      if (!holeNumber || holeNumber < 1 || holeNumber > league.num_holes) {
        throw new Error(`Invalid hole number: ${holeNumber}. Must be 1-${league.num_holes}`);
      }
      if (!strokes || !Number.isInteger(strokes) || strokes < 1 || strokes > 20) {
        throw new Error(`Invalid strokes for hole ${holeNumber}: must be 1-20`);
      }
    }

    let lastResult: SubmitScoreResult | null = null;
    for (const { holeNumber, strokes } of scores) {
      const { data: result, error } = await supabase.rpc('submit_league_score', {
        p_league_week_id: leagueWeekId,
        p_league_player_id: leaguePlayerId,
        p_hole_number: holeNumber,
        p_strokes: strokes,
        p_bay_id: null,
        p_entered_via: enteredVia,
      });
      if (error) {
        throw new Error(`Failed to submit score for hole ${holeNumber}: ${error.message}`);
      }
      if (result) lastResult = result as SubmitScoreResult;
    }

    return lastResult || { score_id: '', league_id: leagueId, holes_entered: scores.length, total_holes: scores.length, round_gross: 0, round_complete: false };
  }

  async getWeekScores(leagueId: string, weekId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('league_scores')
      .select('*, league_players(display_name, current_handicap)')
      .eq('league_week_id', weekId)
      .order('league_player_id')
      .order('hole_number');

    if (error) {
      throw new Error(`Failed to fetch week scores: ${error.message}`);
    }

    return data || [];
  }

  async getPlayerScorecard(leagueId: string, weekId: string, playerId: string): Promise<any> {
    const { data: scores, error } = await supabase
      .from('league_scores')
      .select('hole_number, strokes, entered_via, score_status, created_at')
      .eq('league_week_id', weekId)
      .eq('league_player_id', playerId)
      .order('hole_number');

    if (error) {
      throw new Error(`Failed to fetch scorecard: ${error.message}`);
    }

    const { data: player } = await supabase
      .from('league_players')
      .select('display_name, current_handicap')
      .eq('id', playerId)
      .single();

    const league = await this.getLeague(leagueId);

    // Try to get course par from the week's assigned course
    const course = await this.courseService.getCourseForWeek(weekId, league);
    const totalPar = course?.total_par || (league.num_holes * league.par_per_hole);

    const totalGross = (scores || []).reduce((sum: number, s: any) => sum + s.strokes, 0);
    const netScore = calculateNetScore(totalGross, player?.current_handicap || 0);

    return {
      player: player?.display_name,
      handicap: player?.current_handicap || 0,
      scores: scores || [],
      totalGross,
      totalPar,
      netScore,
      holesCompleted: (scores || []).length,
      totalHoles: league.num_holes,
      courseName: course?.course_name || null,
      holePars: course?.hole_pars || null,
    };
  }

  async confirmScore(scoreId: string, confirmedBy: string): Promise<void> {
    const { error } = await supabase
      .from('league_scores')
      .update({
        score_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmedBy,
      })
      .eq('id', scoreId);

    if (error) {
      throw new Error(`Failed to confirm score: ${error.message}`);
    }
  }

  async confirmWeekScores(weekId: string, confirmedBy: string): Promise<number> {
    const { data, error } = await supabase
      .from('league_scores')
      .update({
        score_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmedBy,
      })
      .eq('league_week_id', weekId)
      .eq('score_status', 'submitted')
      .select('id');

    if (error) {
      throw new Error(`Failed to confirm week scores: ${error.message}`);
    }

    return (data || []).length;
  }

  async overrideScore(scoreId: string, newStrokes: number, overriddenBy: string, reason: string): Promise<void> {
    const { error } = await supabase
      .from('league_scores')
      .update({
        strokes: newStrokes,
        score_status: 'overridden',
        confirmed_at: new Date().toISOString(),
        confirmed_by: overriddenBy,
        override_reason: reason,
      })
      .eq('id', scoreId);

    if (error) {
      throw new Error(`Failed to override score: ${error.message}`);
    }
  }
}
