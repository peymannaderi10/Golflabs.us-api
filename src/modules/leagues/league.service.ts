import { supabase } from '../../config/database';
import { stripe } from '../../config/stripe';
import { calculateHandicap, calculateDifferential, calculateNetScore } from './handicap.utils';
import {
  League,
  LeaguePlayer,
  LeagueWeek,
  CreateLeagueRequest,
  UpdateLeagueRequest,
  EnrollPlayerRequest,
  SubmitScoreRequest,
  SubmitScoreResult,
  StandingWithPlayer,
  LiveLeaderboardEntry,
} from './league.types';

export class LeagueService {

  // =====================================================
  // LEAGUE CRUD
  // =====================================================

  async createLeague(data: CreateLeagueRequest): Promise<League> {
    const {
      locationId,
      name,
      format = 'stroke_play',
      numHoles = 9,
      parPerHole = 3,
      totalWeeks,
      dayOfWeek,
      startTime,
      endTime,
      seasonFee = 0,
      weeklyPrizePot = 0,
      maxPlayers = 32,
      handicapEnabled = true,
      startDate,
    } = data;

    // Insert the league
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({
        location_id: locationId,
        name,
        format,
        num_holes: numHoles,
        par_per_hole: parPerHole,
        total_weeks: totalWeeks,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        season_fee: seasonFee,
        weekly_prize_pot: weeklyPrizePot,
        max_players: maxPlayers,
        handicap_enabled: handicapEnabled,
      })
      .select()
      .single();

    if (error || !league) {
      throw new Error(`Failed to create league: ${error?.message}`);
    }

    // Auto-generate league_weeks rows
    const weeks = [];
    const start = new Date(startDate);
    for (let i = 0; i < totalWeeks; i++) {
      const weekDate = new Date(start);
      weekDate.setDate(weekDate.getDate() + (i * 7));
      weeks.push({
        league_id: league.id,
        week_number: i + 1,
        date: weekDate.toISOString().split('T')[0],
        status: 'upcoming',
      });
    }

    const { error: weeksError } = await supabase
      .from('league_weeks')
      .insert(weeks);

    if (weeksError) {
      console.error('Failed to create league weeks:', weeksError);
      // Non-fatal — league is still created
    }

    return league;
  }

  async getLeaguesByLocation(locationId: string): Promise<League[]> {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('location_id', locationId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch leagues: ${error.message}`);
    }

    return data || [];
  }

  async getLeague(leagueId: string): Promise<League> {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .single();

    if (error || !data) {
      throw new Error(`League not found: ${error?.message}`);
    }

    return data;
  }

  async updateLeague(leagueId: string, data: UpdateLeagueRequest): Promise<League> {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.format !== undefined) updateData.format = data.format;
    if (data.numHoles !== undefined) updateData.num_holes = data.numHoles;
    if (data.parPerHole !== undefined) updateData.par_per_hole = data.parPerHole;
    if (data.seasonFee !== undefined) updateData.season_fee = data.seasonFee;
    if (data.weeklyPrizePot !== undefined) updateData.weekly_prize_pot = data.weeklyPrizePot;
    if (data.maxPlayers !== undefined) updateData.max_players = data.maxPlayers;
    if (data.handicapEnabled !== undefined) updateData.handicap_enabled = data.handicapEnabled;
    if (data.startTime !== undefined) updateData.start_time = data.startTime;
    if (data.endTime !== undefined) updateData.end_time = data.endTime;

    const { data: league, error } = await supabase
      .from('leagues')
      .update(updateData)
      .eq('id', leagueId)
      .select()
      .single();

    if (error || !league) {
      throw new Error(`Failed to update league: ${error?.message}`);
    }

    return league;
  }

  async activateLeague(leagueId: string): Promise<League> {
    const league = await this.getLeague(leagueId);

    if (league.status !== 'draft' && league.status !== 'registration') {
      throw new Error(`Cannot activate league in '${league.status}' status`);
    }

    const { data, error } = await supabase
      .from('leagues')
      .update({ status: 'active', current_week: 1 })
      .eq('id', leagueId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to activate league: ${error?.message}`);
    }

    return data;
  }

  // =====================================================
  // PLAYER ENROLLMENT
  // =====================================================

  async enrollPlayer(leagueId: string, data: EnrollPlayerRequest): Promise<LeaguePlayer> {
    const league = await this.getLeague(leagueId);

    // Check capacity
    const { count, error: countError } = await supabase
      .from('league_players')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .neq('enrollment_status', 'withdrawn');

    if (countError) {
      throw new Error(`Failed to check player count: ${countError.message}`);
    }

    if (count !== null && count >= league.max_players) {
      throw new Error('League is full');
    }

    // Insert player
    const { data: player, error } = await supabase
      .from('league_players')
      .insert({
        league_id: leagueId,
        user_id: data.userId,
        display_name: data.displayName,
        enrollment_status: 'active',
      })
      .select()
      .single();

    if (error || !player) {
      if (error?.code === '23505') {
        throw new Error('Player is already enrolled in this league');
      }
      throw new Error(`Failed to enroll player: ${error?.message}`);
    }

    // Create initial standings row
    const { error: standingsError } = await supabase
      .from('league_standings')
      .insert({
        league_id: leagueId,
        league_player_id: player.id,
      });

    if (standingsError) {
      console.error('Failed to create standings row:', standingsError);
    }

    return player;
  }

  async getPlayers(leagueId: string): Promise<(LeaguePlayer & { email?: string })[]> {
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

  async withdrawPlayer(leagueId: string, playerId: string): Promise<void> {
    const { error } = await supabase
      .from('league_players')
      .update({ enrollment_status: 'withdrawn' })
      .eq('id', playerId)
      .eq('league_id', leagueId);

    if (error) {
      throw new Error(`Failed to withdraw player: ${error.message}`);
    }
  }

  // =====================================================
  // WEEKLY SESSIONS
  // =====================================================

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

  async finalizeWeek(leagueId: string, weekId: string): Promise<{ standings: StandingWithPlayer[] }> {
    // Set week status to 'finalized'
    const { error: weekError } = await supabase
      .from('league_weeks')
      .update({ status: 'finalized' })
      .eq('id', weekId)
      .eq('league_id', leagueId);

    if (weekError) {
      throw new Error(`Failed to finalize week: ${weekError.message}`);
    }

    // Recalculate standings
    await this.recalculateStandings(leagueId);

    // Recalculate handicaps
    const league = await this.getLeague(leagueId);
    if (league.handicap_enabled) {
      await this.recalculateHandicaps(leagueId, weekId);
    }

    // Return updated standings
    const standings = await this.getStandings(leagueId);

    return { standings };
  }

  // =====================================================
  // SCORE ENTRY
  // =====================================================

  async submitScore(data: SubmitScoreRequest): Promise<SubmitScoreResult> {
    const { leagueWeekId, leaguePlayerId, holeNumber, strokes, bayId, enteredVia = 'kiosk' } = data;

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
      .select('hole_number, strokes, entered_via, created_at')
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

    const { data: league } = await supabase
      .from('leagues')
      .select('num_holes, par_per_hole')
      .eq('id', leagueId)
      .single();

    const totalGross = (scores || []).reduce((sum: number, s: any) => sum + s.strokes, 0);
    const totalPar = (league?.num_holes || 9) * (league?.par_per_hole || 3);
    const netScore = calculateNetScore(totalGross, player?.current_handicap || 0);

    return {
      player: player?.display_name,
      handicap: player?.current_handicap || 0,
      scores: scores || [],
      totalGross,
      totalPar,
      netScore,
      holesCompleted: (scores || []).length,
      totalHoles: league?.num_holes || 9,
    };
  }

  // =====================================================
  // STANDINGS & LEADERBOARD
  // =====================================================

  async getStandings(leagueId: string): Promise<StandingWithPlayer[]> {
    const { data, error } = await supabase
      .from('league_standings')
      .select('*, league_players(display_name, current_handicap)')
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
    }));
  }

  async getLiveLeaderboard(leagueId: string): Promise<LiveLeaderboardEntry[]> {
    const league = await this.getLeague(leagueId);

    // Get the current active or most recent finalized week
    const { data: activeWeek } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', leagueId)
      .in('status', ['active', 'scoring'])
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

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

  // =====================================================
  // STANDINGS RECALCULATION
  // =====================================================

  private async recalculateStandings(leagueId: string): Promise<void> {
    const league = await this.getLeague(leagueId);

    // Get all finalized weeks
    const { data: finalizedWeeks } = await supabase
      .from('league_weeks')
      .select('id')
      .eq('league_id', leagueId)
      .eq('status', 'finalized');

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

    // Calculate per-player stats
    const playerStats = new Map<string, {
      weeksPlayed: number;
      totalGross: number;
      totalNet: number;
      bestGross: number | null;
      roundGrosses: number[];
    }>();

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

    // Now compute stats
    for (const player of players) {
      const weekMap = scoresByPlayerWeek.get(player.id);
      if (!weekMap || weekMap.size === 0) {
        playerStats.set(player.id, {
          weeksPlayed: 0,
          totalGross: 0,
          totalNet: 0,
          bestGross: null,
          roundGrosses: [],
        });
        continue;
      }

      const roundGrosses: number[] = [];
      let totalGross = 0;
      let bestGross: number | null = null;

      weekMap.forEach((gross) => {
        roundGrosses.push(gross);
        totalGross += gross;
        if (bestGross === null || gross < bestGross) {
          bestGross = gross;
        }
      });

      const handicap = player.current_handicap || 0;
      const totalNet = totalGross - (handicap * weekMap.size);

      playerStats.set(player.id, {
        weeksPlayed: weekMap.size,
        totalGross,
        totalNet: Math.round(totalNet * 10) / 10,
        bestGross,
        roundGrosses,
      });
    }

    // Sort players by total net for ranking
    const rankedPlayers = [...playerStats.entries()]
      .sort((a, b) => {
        // Players with no weeks come last
        if (a[1].weeksPlayed === 0 && b[1].weeksPlayed > 0) return 1;
        if (a[1].weeksPlayed > 0 && b[1].weeksPlayed === 0) return -1;
        return a[1].totalNet - b[1].totalNet;
      });

    // Update standings
    for (let i = 0; i < rankedPlayers.length; i++) {
      const [playerId, stats] = rankedPlayers[i];
      const avgGross = stats.weeksPlayed > 0
        ? Math.round((stats.totalGross / stats.weeksPlayed) * 10) / 10
        : 0;

      await supabase
        .from('league_standings')
        .upsert({
          league_id: leagueId,
          league_player_id: playerId,
          weeks_played: stats.weeksPlayed,
          total_gross: stats.totalGross,
          total_net: stats.totalNet,
          best_gross: stats.bestGross,
          avg_gross: avgGross,
          current_rank: stats.weeksPlayed > 0 ? i + 1 : 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'league_id,league_player_id' });
    }
  }

  // =====================================================
  // HANDICAP RECALCULATION
  // =====================================================

  async recalculateHandicaps(leagueId: string, weekId?: string): Promise<void> {
    const league = await this.getLeague(leagueId);
    const players = await this.getPlayers(leagueId);

    // Get all finalized weeks in order
    const { data: finalizedWeeks } = await supabase
      .from('league_weeks')
      .select('id')
      .eq('league_id', leagueId)
      .eq('status', 'finalized')
      .order('week_number');

    const weekIds = (finalizedWeeks || []).map((w: any) => w.id);
    if (weekIds.length === 0) return;

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

      // Build differentials in week order
      const differentials: number[] = [];
      for (const wId of weekIds) {
        const gross = weekGrosses.get(wId);
        if (gross !== undefined) {
          differentials.push(calculateDifferential(gross, league.num_holes, league.par_per_hole));
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

  // =====================================================
  // PAYMENT — ENROLL AND PAY
  // =====================================================

  async enrollAndPay(leagueId: string, userId: string, displayName: string): Promise<{ clientSecret: string; playerId: string }> {
    const league = await this.getLeague(leagueId);

    if (league.status !== 'registration' && league.status !== 'active') {
      throw new Error('League is not accepting enrollments');
    }

    // Check capacity
    const { count } = await supabase
      .from('league_players')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .neq('enrollment_status', 'withdrawn');

    if (count !== null && count >= league.max_players) {
      throw new Error('League is full');
    }

    // Check if already enrolled
    const { data: existing } = await supabase
      .from('league_players')
      .select('id, enrollment_status')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .single();

    if (existing && existing.enrollment_status !== 'withdrawn') {
      throw new Error('Player is already enrolled in this league');
    }

    // Create pending player record
    const { data: player, error: playerError } = await supabase
      .from('league_players')
      .upsert({
        league_id: leagueId,
        user_id: userId,
        display_name: displayName,
        enrollment_status: 'pending',
        season_paid: false,
        prize_pot_paid: false,
      }, { onConflict: 'league_id,user_id' })
      .select()
      .single();

    if (playerError || !player) {
      throw new Error(`Failed to create player record: ${playerError?.message}`);
    }

    // Calculate total amount
    const totalAmount = (league.season_fee + league.weekly_prize_pot) * 100; // cents

    if (totalAmount === 0) {
      // Free league — activate immediately
      await supabase
        .from('league_players')
        .update({ enrollment_status: 'active', season_paid: true, prize_pot_paid: true })
        .eq('id', player.id);

      await supabase
        .from('league_standings')
        .upsert({ league_id: leagueId, league_player_id: player.id }, { onConflict: 'league_id,league_player_id' });

      return { clientSecret: '', playerId: player.id };
    }

    // Get or create Stripe customer
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', userId)
      .single();

    let stripeCustomerId = userProfile?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userProfile?.email,
        name: userProfile?.full_name,
        metadata: { user_id: userId },
      });
      stripeCustomerId = customer.id;

      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', userId);
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'league_enrollment',
        league_id: leagueId,
        user_id: userId,
        league_player_id: player.id,
        season_fee: String(league.season_fee),
        prize_pot: String(league.weekly_prize_pot),
      },
    });

    // Store payment intent ID on the player record
    await supabase
      .from('league_players')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', player.id);

    return {
      clientSecret: paymentIntent.client_secret!,
      playerId: player.id,
    };
  }

  // =====================================================
  // HELPER: Get league + player info for a kiosk
  // =====================================================

  // =====================================================
  // USER-FACING: Get all leagues a user is enrolled in
  // =====================================================

  async getLeaguesForUser(userId: string): Promise<any[]> {
    // Get all league_players rows for this user (not withdrawn)
    const { data: enrollments, error } = await supabase
      .from('league_players')
      .select('*, leagues(*)')
      .eq('user_id', userId)
      .neq('enrollment_status', 'withdrawn');

    if (error) {
      throw new Error(`Failed to fetch user leagues: ${error.message}`);
    }

    if (!enrollments || enrollments.length === 0) {
      return [];
    }

    const results = [];

    for (const enrollment of enrollments) {
      const league = enrollment.leagues;
      if (!league) continue;

      // Get standing for this player in this league
      const { data: standing } = await supabase
        .from('league_standings')
        .select('*')
        .eq('league_id', league.id)
        .eq('league_player_id', enrollment.id)
        .single();

      // Get next upcoming or active week
      const { data: nextWeek } = await supabase
        .from('league_weeks')
        .select('id, week_number, date, status')
        .eq('league_id', league.id)
        .in('status', ['upcoming', 'active'])
        .order('week_number')
        .limit(1)
        .single();

      results.push({
        league: {
          id: league.id,
          name: league.name,
          format: league.format,
          num_holes: league.num_holes,
          par_per_hole: league.par_per_hole,
          total_weeks: league.total_weeks,
          current_week: league.current_week,
          day_of_week: league.day_of_week,
          start_time: league.start_time,
          end_time: league.end_time,
          season_fee: league.season_fee,
          weekly_prize_pot: league.weekly_prize_pot,
          max_players: league.max_players,
          handicap_enabled: league.handicap_enabled,
          status: league.status,
          created_at: league.created_at,
        },
        player: {
          id: enrollment.id,
          displayName: enrollment.display_name,
          handicap: enrollment.current_handicap,
          enrollmentStatus: enrollment.enrollment_status,
          seasonPaid: enrollment.season_paid,
        },
        standing: standing ? {
          rank: standing.current_rank,
          weeksPlayed: standing.weeks_played,
          totalGross: standing.total_gross,
          totalNet: standing.total_net,
          avgGross: standing.avg_gross,
          bestGross: standing.best_gross,
        } : null,
        nextWeek: nextWeek ? {
          id: nextWeek.id,
          weekNumber: nextWeek.week_number,
          date: nextWeek.date,
          status: nextWeek.status,
        } : null,
      });
    }

    return results;
  }

  // =====================================================
  // HELPER: Get league + player info for a kiosk
  // =====================================================

  async getLeagueStateForKiosk(leagueId: string, options: { playerId?: string; userId?: string }): Promise<any> {
    const league = await this.getLeague(leagueId);

    // Get current active week
    const { data: activeWeek } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', leagueId)
      .in('status', ['active', 'scoring'])
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    // Resolve player — by playerId directly, or look up by userId
    let player: any = null;
    if (options.playerId) {
      const { data } = await supabase
        .from('league_players')
        .select('*')
        .eq('id', options.playerId)
        .single();
      player = data;
    } else if (options.userId) {
      const { data } = await supabase
        .from('league_players')
        .select('*')
        .eq('league_id', leagueId)
        .eq('user_id', options.userId)
        .neq('enrollment_status', 'withdrawn')
        .single();
      player = data;
    }

    // Get player's scores for the active week
    let scores: any[] = [];
    let nextHole = 1;

    if (activeWeek) {
      const { data: weekScores } = await supabase
        .from('league_scores')
        .select('hole_number, strokes')
        .eq('league_week_id', activeWeek.id)
        .eq('league_player_id', player.id)
        .order('hole_number');

      scores = weekScores || [];
      nextHole = scores.length > 0
        ? Math.max(...scores.map((s: any) => s.hole_number)) + 1
        : 1;
    }

    return {
      league: {
        id: league.id,
        name: league.name,
        numHoles: league.num_holes,
        parPerHole: league.par_per_hole,
        currentWeek: league.current_week,
      },
      week: activeWeek ? {
        id: activeWeek.id,
        weekNumber: activeWeek.week_number,
        date: activeWeek.date,
        status: activeWeek.status,
      } : null,
      player: player ? {
        id: player.id,
        displayName: player.display_name,
        handicap: player.current_handicap,
      } : null,
      scores,
      nextHole: Math.min(nextHole, league.num_holes),
      roundComplete: player ? scores.length >= league.num_holes : false,
    };
  }
}
