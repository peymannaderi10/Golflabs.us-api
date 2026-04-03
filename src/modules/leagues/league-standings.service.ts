import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { calculateNetScore, calculateHandicap, calculateDifferentialFromPar } from './handicap.utils';
import { calculateTeamScore } from './team-scoring.utils';
import {
  League,
  LeaguePlayer,
  StandingWithPlayer,
  LiveLeaderboardEntry,
  TeamLeaderboardEntry,
  PointsConfig,
} from './league.types';

export class LeagueStandingsService {

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

  private async getPlayers(leagueId: string): Promise<(LeaguePlayer & { email?: string })[]> {
    const { data, error } = await supabase
      .from('league_players')
      .select('*, user_profiles(email)')
      .eq('league_id', leagueId)
      .neq('enrollment_status', 'withdrawn')
      .order('display_name');

    if (error) {
      throw new Error(`Failed to fetch players: ${error.message}`);
    }

    return (data || []).map((p: any) => ({
      ...p,
      email: p.user_profiles?.email,
      user_profiles: undefined,
    }));
  }

  async getStandings(leagueId: string): Promise<StandingWithPlayer[]> {
    const { data, error } = await supabase
      .from('league_standings')
      .select('*, league_players(display_name, current_handicap), league_teams(team_name)')
      .eq('league_id', leagueId)
      .order('current_rank');

    if (error) {
      throw new Error(`Failed to fetch standings: ${error.message}`);
    }

    return (data || []).map((s: any) => ({
      rank: s.current_rank,
      playerId: s.league_player_id,
      displayName: s.league_players?.display_name || 'Unknown',
      handicap: s.league_players?.current_handicap || 0,
      weeksPlayed: s.weeks_played,
      totalGross: s.total_gross,
      totalNet: s.total_net,
      avgGross: s.avg_gross,
      bestGross: s.best_gross,
      points: s.points,
      teamId: s.league_team_id || undefined,
      teamName: s.league_teams?.team_name || undefined,
    }));
  }

  async getLiveLeaderboard(leagueId: string): Promise<LiveLeaderboardEntry[]> {
    const league = await this.getLeague(leagueId);

    // Get the current active or most recent finalized week
    const { data: activeWeek } = await supabase
      .from('league_weeks')
      .select('*, league_courses(course_name, total_par)')
      .eq('league_id', leagueId)
      .in('status', ['active', 'scoring'])
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    // Resolve course info for this week
    let courseName: string | undefined;
    let coursePar: number | undefined;
    if (activeWeek?.league_courses) {
      courseName = (activeWeek.league_courses as any).course_name;
      coursePar = (activeWeek.league_courses as any).total_par;
    }

    // Get all active players
    const players = await this.getPlayers(leagueId);

    // Get season standings
    const { data: standings } = await supabase
      .from('league_standings')
      .select('*')
      .eq('league_id', leagueId);

    const standingsMap = new Map((standings || []).map((s: any) => [s.league_player_id, s]));

    // Get today's scores if there's an active week
    let todayScoresMap = new Map<string, { gross: number; holesCompleted: number }>();

    if (activeWeek) {
      const { data: todayScores } = await supabase
        .from('league_scores')
        .select('league_player_id, strokes')
        .eq('league_week_id', activeWeek.id);

      // Aggregate scores by player
      const playerScores = new Map<string, { gross: number; holes: number }>();
      (todayScores || []).forEach((s: any) => {
        const existing = playerScores.get(s.league_player_id) || { gross: 0, holes: 0 };
        existing.gross += s.strokes;
        existing.holes += 1;
        playerScores.set(s.league_player_id, existing);
      });

      playerScores.forEach((val, key) => {
        todayScoresMap.set(key, { gross: val.gross, holesCompleted: val.holes });
      });
    }

    // Build leaderboard entries
    const entries: LiveLeaderboardEntry[] = players.map((player) => {
      const standing = standingsMap.get(player.id);
      const today = todayScoresMap.get(player.id);

      return {
        rank: standing?.current_rank || 0,
        playerId: player.id,
        displayName: player.display_name,
        handicap: player.current_handicap,
        todayGross: today?.gross || 0,
        todayNet: today ? calculateNetScore(today.gross, player.current_handicap) : 0,
        thru: today?.holesCompleted || 0,
        totalHoles: league.num_holes,
        seasonGross: standing?.total_gross || 0,
        seasonNet: standing?.total_net || 0,
        weeksPlayed: standing?.weeks_played || 0,
        courseName,
        coursePar,
      };
    });

    // Sort by today's net score (ascending), then by season rank
    entries.sort((a, b) => {
      // Players who have started today come first
      if (a.thru > 0 && b.thru === 0) return -1;
      if (a.thru === 0 && b.thru > 0) return 1;
      // Among players who have started, sort by net score
      if (a.thru > 0 && b.thru > 0) {
        return a.todayNet - b.todayNet;
      }
      // Among players who haven't started, sort by season rank
      return a.rank - b.rank;
    });

    // Re-assign rank based on sorted order
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  async recalculateStandings(leagueId: string): Promise<void> {
    const league = await this.getLeague(leagueId);
    const scoringType = league.scoring_type || 'net_stroke_play';

    // Get all finalized weeks
    const { data: finalizedWeeks } = await supabase
      .from('league_weeks')
      .select('id')
      .eq('league_id', leagueId)
      .eq('status', 'finalized')
      .order('week_number');

    const weekIds = (finalizedWeeks || []).map((w: any) => w.id);

    if (weekIds.length === 0) return;

    // Get all scores for finalized weeks
    const { data: allScores } = await supabase
      .from('league_scores')
      .select('league_week_id, league_player_id, strokes')
      .in('league_week_id', weekIds);

    // Get all players
    const { data: players } = await supabase
      .from('league_players')
      .select('id, current_handicap')
      .eq('league_id', leagueId)
      .neq('enrollment_status', 'withdrawn');

    if (!players || !allScores) return;

    // Group scores by player and week
    const scoresByPlayerWeek = new Map<string, Map<string, number>>();
    (allScores || []).forEach((score: any) => {
      const key = score.league_player_id;
      if (!scoresByPlayerWeek.has(key)) {
        scoresByPlayerWeek.set(key, new Map());
      }
      const weekMap = scoresByPlayerWeek.get(key)!;
      const weekGross = (weekMap.get(score.league_week_id) || 0) + score.strokes;
      weekMap.set(score.league_week_id, weekGross);
    });

    // Calculate per-player stats
    const playerStats = new Map<string, {
      weeksPlayed: number;
      totalGross: number;
      totalNet: number;
      bestGross: number | null;
      roundGrosses: number[];
      points: number;
    }>();

    // For points-based scoring, compute weekly rankings first
    let weeklyRankings: Map<string, Map<string, number>> | null = null; // weekId -> playerId -> rank
    if (scoringType === 'points_based') {
      weeklyRankings = new Map();
      for (const weekId of weekIds) {
        const weekPlayerScores: { playerId: string; net: number }[] = [];
        for (const player of players) {
          const weekMap = scoresByPlayerWeek.get(player.id);
          const gross = weekMap?.get(weekId);
          if (gross !== undefined) {
            const handicap = player.current_handicap || 0;
            weekPlayerScores.push({
              playerId: player.id,
              net: gross - handicap,
            });
          }
        }
        // Sort by net ascending (lower is better)
        weekPlayerScores.sort((a, b) => a.net - b.net);
        const rankMap = new Map<string, number>();
        weekPlayerScores.forEach((entry, idx) => {
          rankMap.set(entry.playerId, idx + 1);
        });
        weeklyRankings.set(weekId, rankMap);
      }
    }

    // Now compute stats for each player
    for (const player of players) {
      const weekMap = scoresByPlayerWeek.get(player.id);
      if (!weekMap || weekMap.size === 0) {
        playerStats.set(player.id, {
          weeksPlayed: 0,
          totalGross: 0,
          totalNet: 0,
          bestGross: null,
          roundGrosses: [],
          points: 0,
        });
        continue;
      }

      const roundGrosses: number[] = [];
      let totalGross = 0;
      let bestGross: number | null = null;
      let totalPoints = 0;

      weekMap.forEach((gross) => {
        roundGrosses.push(gross);
        totalGross += gross;
        if (bestGross === null || gross < bestGross) {
          bestGross = gross;
        }
      });

      const handicap = player.current_handicap || 0;
      const totalNet = totalGross - (handicap * weekMap.size);

      // Calculate points if points-based
      if (scoringType === 'points_based' && weeklyRankings) {
        const config = league.points_config || {
          win_week: 10,
          second_place: 7,
          third_place: 5,
          participation: 2,
          low_gross_bonus: 3,
        };

        for (const weekId of weekIds) {
          const rankMap = weeklyRankings.get(weekId);
          if (!rankMap) continue;
          const rank = rankMap.get(player.id);
          if (rank === undefined) continue;

          // Award points based on placement
          if (rank === 1) {
            totalPoints += config.win_week;
          } else if (rank === 2) {
            totalPoints += config.second_place;
          } else if (rank === 3) {
            totalPoints += config.third_place;
          } else {
            totalPoints += config.participation;
          }

          // Low gross bonus: check if this player had the lowest gross for the week
          const weekGross = weekMap.get(weekId);
          if (weekGross !== undefined) {
            let isLowestGross = true;
            for (const otherPlayer of players) {
              if (otherPlayer.id === player.id) continue;
              const otherWeekMap = scoresByPlayerWeek.get(otherPlayer.id);
              const otherGross = otherWeekMap?.get(weekId);
              if (otherGross !== undefined && otherGross < weekGross) {
                isLowestGross = false;
                break;
              }
            }
            if (isLowestGross) {
              totalPoints += config.low_gross_bonus;
            }
          }
        }
      }

      playerStats.set(player.id, {
        weeksPlayed: weekMap.size,
        totalGross,
        totalNet: Math.round(totalNet * 10) / 10,
        bestGross,
        roundGrosses,
        points: totalPoints,
      });
    }

    // Sort players based on scoring type
    const rankedPlayers = [...playerStats.entries()]
      .sort((a, b) => {
        // Players with no weeks come last
        if (a[1].weeksPlayed === 0 && b[1].weeksPlayed > 0) return 1;
        if (a[1].weeksPlayed > 0 && b[1].weeksPlayed === 0) return -1;

        if (scoringType === 'gross_stroke_play') {
          return a[1].totalGross - b[1].totalGross;
        } else if (scoringType === 'points_based') {
          return b[1].points - a[1].points; // Higher points = better
        } else {
          // net_stroke_play (default)
          return a[1].totalNet - b[1].totalNet;
        }
      });

    // Batch upsert all standings at once
    const standingsRows = rankedPlayers.map(([playerId, stats], i) => {
      const avgGross = stats.weeksPlayed > 0
        ? Math.round((stats.totalGross / stats.weeksPlayed) * 10) / 10
        : 0;
      return {
        league_id: leagueId,
        league_player_id: playerId,
        weeks_played: stats.weeksPlayed,
        total_gross: stats.totalGross,
        total_net: stats.totalNet,
        best_gross: stats.bestGross,
        avg_gross: avgGross,
        current_rank: stats.weeksPlayed > 0 ? i + 1 : 0,
        points: stats.points,
        updated_at: new Date().toISOString(),
      };
    });

    if (standingsRows.length > 0) {
      await supabase
        .from('league_standings')
        .upsert(standingsRows, { onConflict: 'league_id,league_player_id' });
    }
  }

  async recalculateTeamStandings(leagueId: string): Promise<void> {
    const league = await this.getLeague(leagueId);

    // Get all active teams for this league
    const { data: teams } = await supabase
      .from('league_teams')
      .select('id, team_name, status')
      .eq('league_id', leagueId)
      .in('status', ['active']);

    if (!teams || teams.length === 0) return;

    // Get all finalized weeks
    const { data: finalizedWeeks } = await supabase
      .from('league_weeks')
      .select('id')
      .eq('league_id', leagueId)
      .eq('status', 'finalized')
      .order('week_number');

    const weekIds = (finalizedWeeks || []).map((w: any) => w.id);
    if (weekIds.length === 0) return;

    // Calculate team scores for each team across all finalized weeks
    const teamStats = new Map<string, {
      weeksPlayed: number;
      totalGross: number;
      totalNet: number;
      bestGross: number | null;
      points: number;
    }>();

    for (const team of teams) {
      let weeksPlayed = 0;
      let totalGross = 0;
      let totalNet = 0;
      let bestGross: number | null = null;

      for (const weekId of weekIds) {
        const result = await calculateTeamScore(team.id, weekId, league);
        if (result.teamGross > 0) {
          weeksPlayed++;
          totalGross += result.teamGross;
          totalNet += result.teamNet;
          if (bestGross === null || result.teamGross < bestGross) {
            bestGross = result.teamGross;
          }
        }
      }

      teamStats.set(team.id, {
        weeksPlayed,
        totalGross,
        totalNet: Math.round(totalNet * 10) / 10,
        bestGross,
        points: 0, // Team points can be added later if needed
      });
    }

    // Rank teams by net score (ascending = better)
    const rankedTeams = [...teamStats.entries()]
      .sort((a, b) => {
        if (a[1].weeksPlayed === 0 && b[1].weeksPlayed > 0) return 1;
        if (a[1].weeksPlayed > 0 && b[1].weeksPlayed === 0) return -1;
        return a[1].totalNet - b[1].totalNet;
      });

    // Batch fetch one member per team for the reference player_id
    const teamIds = rankedTeams.map(([id]) => id);
    const { data: allTeamMembers } = teamIds.length > 0
      ? await supabase
          .from('league_players')
          .select('id, league_team_id')
          .in('league_team_id', teamIds)
      : { data: [] };

    const teamMemberMap = new Map<string, string>();
    for (const m of allTeamMembers || []) {
      if (!teamMemberMap.has(m.league_team_id)) {
        teamMemberMap.set(m.league_team_id, m.id);
      }
    }

    // Batch upsert team standings
    const teamStandingsRows = rankedTeams
      .map(([teamId, stats], i) => {
        const memberId = teamMemberMap.get(teamId);
        if (!memberId) return null;
        const avgGross = stats.weeksPlayed > 0
          ? Math.round((stats.totalGross / stats.weeksPlayed) * 10) / 10
          : 0;
        return {
          league_id: leagueId,
          league_player_id: memberId,
          league_team_id: teamId,
          weeks_played: stats.weeksPlayed,
          total_gross: stats.totalGross,
          total_net: stats.totalNet,
          best_gross: stats.bestGross,
          avg_gross: avgGross,
          current_rank: stats.weeksPlayed > 0 ? i + 1 : 0,
          points: stats.points,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (teamStandingsRows.length > 0) {
      await supabase
        .from('league_standings')
        .upsert(teamStandingsRows, { onConflict: 'league_id,league_player_id' });
    }
  }

  async getTeamLeaderboard(leagueId: string): Promise<TeamLeaderboardEntry[]> {
    const league = await this.getLeague(leagueId);

    if (league.format !== 'team') {
      throw new Error('This league is not a team league');
    }

    // Get all active teams
    const { data: teams } = await supabase
      .from('league_teams')
      .select('id, team_name, status')
      .eq('league_id', leagueId)
      .in('status', ['active']);

    if (!teams || teams.length === 0) return [];

    // Get the current active week
    const { data: activeWeek } = await supabase
      .from('league_weeks')
      .select('*, league_courses(course_name, total_par)')
      .eq('league_id', leagueId)
      .in('status', ['active', 'scoring'])
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    let courseName: string | undefined;
    let coursePar: number | undefined;
    if (activeWeek?.league_courses) {
      courseName = (activeWeek.league_courses as any).course_name;
      coursePar = (activeWeek.league_courses as any).total_par;
    }

    // Get team standings
    const { data: standings } = await supabase
      .from('league_standings')
      .select('*')
      .eq('league_id', leagueId)
      .not('league_team_id', 'is', null);

    const standingsMap = new Map((standings || []).map((s: any) => [s.league_team_id, s]));

    // Build entries for each team
    const entries: TeamLeaderboardEntry[] = [];

    for (const team of teams) {
      // Get team members
      const { data: members } = await supabase
        .from('league_players')
        .select('id, user_id, display_name, current_handicap')
        .eq('league_team_id', team.id)
        .neq('enrollment_status', 'withdrawn');

      if (!members) continue;

      const memberIds = members.map(m => m.id);

      // Get today's scores for team members
      let memberEntries: TeamLeaderboardEntry['members'] = [];
      let teamTodayGross = 0;
      let teamTodayNet = 0;

      if (activeWeek) {
        const { data: todayScores } = await supabase
          .from('league_scores')
          .select('league_player_id, hole_number, strokes')
          .eq('league_week_id', activeWeek.id)
          .in('league_player_id', memberIds);

        // Aggregate per member
        const memberScoreMap = new Map<string, { gross: number; holes: number }>();
        (todayScores || []).forEach((s: any) => {
          const existing = memberScoreMap.get(s.league_player_id) || { gross: 0, holes: 0 };
          existing.gross += s.strokes;
          existing.holes += 1;
          memberScoreMap.set(s.league_player_id, existing);
        });

        memberEntries = members.map(m => {
          const scores = memberScoreMap.get(m.id);
          // Get individual season standings
          const memberStanding = (standings || []).find((s: any) =>
            s.league_player_id === m.id && !s.league_team_id
          );

          return {
            playerId: m.id,
            displayName: m.display_name,
            handicap: m.current_handicap || 0,
            todayGross: scores?.gross || 0,
            todayNet: scores ? calculateNetScore(scores.gross, m.current_handicap || 0) : 0,
            thru: scores?.holes || 0,
            seasonGross: memberStanding?.total_gross || 0,
            seasonNet: memberStanding?.total_net || 0,
          };
        });

        // Calculate team today score based on scoring format
        if (todayScores && todayScores.length > 0) {
          const result = await calculateTeamScore(team.id, activeWeek.id, league);
          teamTodayGross = result.teamGross;
          teamTodayNet = result.teamNet;
        }
      } else {
        memberEntries = members.map(m => ({
          playerId: m.id,
          displayName: m.display_name,
          handicap: m.current_handicap || 0,
          todayGross: 0,
          todayNet: 0,
          thru: 0,
          seasonGross: 0,
          seasonNet: 0,
        }));
      }

      const teamStanding = standingsMap.get(team.id);

      entries.push({
        rank: teamStanding?.current_rank || 0,
        teamId: team.id,
        teamName: team.team_name,
        status: team.status,
        members: memberEntries,
        teamTodayGross,
        teamTodayNet: Math.round(teamTodayNet * 10) / 10,
        teamSeasonGross: teamStanding?.total_gross || 0,
        teamSeasonNet: teamStanding?.total_net || 0,
        weeksPlayed: teamStanding?.weeks_played || 0,
        scoringFormat: league.team_scoring_format || 'best_ball',
        courseName,
        coursePar,
      });
    }

    // Sort by today's team net score, then by season rank
    entries.sort((a, b) => {
      const aPlaying = a.members.some(m => m.thru > 0);
      const bPlaying = b.members.some(m => m.thru > 0);
      if (aPlaying && !bPlaying) return -1;
      if (!aPlaying && bPlaying) return 1;
      if (aPlaying && bPlaying) {
        return a.teamTodayNet - b.teamTodayNet;
      }
      return a.rank - b.rank;
    });

    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  async recalculateHandicaps(leagueId: string, weekId?: string): Promise<void> {
    const league = await this.getLeague(leagueId);
    const players = await this.getPlayers(leagueId);

    // Get all finalized weeks in order, including their course assignment
    const { data: finalizedWeeks } = await supabase
      .from('league_weeks')
      .select('id, league_course_id')
      .eq('league_id', leagueId)
      .eq('status', 'finalized')
      .order('week_number');

    const weekIds = (finalizedWeeks || []).map((w: any) => w.id);
    if (weekIds.length === 0) return;

    // Build a map of weekId -> totalPar (from course data or fallback)
    const weekParMap = new Map<string, number>();
    const courseCache = new Map<string, number>(); // courseId -> totalPar

    for (const week of (finalizedWeeks || [])) {
      if (week.league_course_id) {
        if (!courseCache.has(week.league_course_id)) {
          const { data: course } = await supabase
            .from('league_courses')
            .select('total_par')
            .eq('id', week.league_course_id)
            .single();
          courseCache.set(week.league_course_id, course?.total_par || (league.num_holes * league.par_per_hole));
        }
        weekParMap.set(week.id, courseCache.get(week.league_course_id)!);
      } else {
        // Fallback to legacy par_per_hole calculation
        weekParMap.set(week.id, league.num_holes * league.par_per_hole);
      }
    }

    for (const player of players) {
      // Get all scores for this player across finalized weeks
      const { data: scores } = await supabase
        .from('league_scores')
        .select('league_week_id, strokes')
        .eq('league_player_id', player.id)
        .in('league_week_id', weekIds);

      if (!scores || scores.length === 0) continue;

      // Group scores by week and compute round grosses
      const weekGrosses = new Map<string, number>();
      scores.forEach((s: any) => {
        weekGrosses.set(s.league_week_id, (weekGrosses.get(s.league_week_id) || 0) + s.strokes);
      });

      // Build differentials in week order using actual course par
      const differentials: number[] = [];
      for (const wId of weekIds) {
        const gross = weekGrosses.get(wId);
        if (gross !== undefined) {
          const totalPar = weekParMap.get(wId) || (league.num_holes * league.par_per_hole);
          differentials.push(calculateDifferentialFromPar(gross, totalPar));
        }
      }

      // Calculate new handicap
      const oldHandicap = player.current_handicap;
      const newHandicap = calculateHandicap(
        differentials,
        league.handicap_rounds_used,
        league.handicap_rounds_window
      );

      // Update player handicap
      if (newHandicap !== oldHandicap) {
        await supabase
          .from('league_players')
          .update({ current_handicap: newHandicap })
          .eq('id', player.id);

        // Record history
        await supabase
          .from('handicap_history')
          .insert({
            league_player_id: player.id,
            league_week_id: weekId || null,
            old_handicap: oldHandicap,
            new_handicap: newHandicap,
            calculation_details: {
              type: 'calculated',
              differentials,
              best_used: [...differentials].sort((a, b) => a - b).slice(0, league.handicap_rounds_used),
              average: differentials.length > 0
                ? differentials.reduce((a, b) => a + b, 0) / Math.min(differentials.length, league.handicap_rounds_used)
                : 0,
              multiplier: 0.96,
            },
          });
      }
    }
  }

}
