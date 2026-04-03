import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import {
  League,
  PrizePoolConfig,
  PrizeLedgerEntry,
  PrizePoolSummary,
  WeekPayoutSummary,
} from './league.types';

export class LeaguePrizeService {

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

  async calculateWeeklyPot(leagueId: string, weekId: string): Promise<number> {
    const league = await this.getLeague(leagueId);

    // Count active players
    const { count, error } = await supabase
      .from('league_players')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('enrollment_status', 'active');

    if (error) throw new Error(`Failed to count active players: ${error.message}`);

    const activePlayers = count || 0;
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;
    if (!prizeConfig?.enabled) return 0;
    const weeklyPot = activePlayers * prizeConfig.buyInPerSession;

    // Store on the week record
    await supabase
      .from('league_weeks')
      .update({ prize_pool_total: weeklyPot })
      .eq('id', weekId);

    return weeklyPot;
  }

  async generateWeekPayouts(leagueId: string, weekId: string): Promise<PrizeLedgerEntry[]> {
    const league = await this.getLeague(leagueId);
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;

    if (!prizeConfig?.enabled || !prizeConfig.payoutSplit?.length) {
      return [];
    }

    // Guard against duplicate payout generation
    const { count: existingPayouts } = await supabase
      .from('league_prize_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('league_week_id', weekId)
      .eq('type', 'payout');

    if (existingPayouts && existingPayouts > 0) return [];

    // Calculate the weekly pot
    const weeklyPot = await this.calculateWeeklyPot(leagueId, weekId);

    if (weeklyPot <= 0) return [];

    // Get weekly scores to determine placement
    // We need each player's total gross/net for this week
    const { data: weekScores, error: scoresError } = await supabase
      .from('league_scores')
      .select('league_player_id, strokes')
      .eq('league_week_id', weekId);

    if (scoresError || !weekScores || weekScores.length === 0) {
      logger.info({ weekId }, 'No scores found for week, skipping payout generation');
      return [];
    }

    // Aggregate per player
    const playerTotals: Record<string, number> = {};
    for (const s of weekScores) {
      playerTotals[s.league_player_id] = (playerTotals[s.league_player_id] || 0) + s.strokes;
    }

    // Get player handicaps for net scoring
    const playerIds = Object.keys(playerTotals);
    const { data: players } = await supabase
      .from('league_players')
      .select('id, display_name, current_handicap')
      .in('id', playerIds);

    const playersMap = new Map((players || []).map(p => [p.id, p]));

    // Calculate net scores and sort
    const scoringType = league.scoring_type || 'net_stroke_play';
    const ranked = playerIds.map(pid => {
      const gross = playerTotals[pid];
      const player = playersMap.get(pid);
      const handicap = player?.current_handicap || 0;
      const net = gross - handicap;
      return {
        playerId: pid,
        playerName: player?.display_name || 'Unknown',
        gross,
        net,
        sortValue: scoringType === 'gross_stroke_play' ? gross : net,
      };
    }).sort((a, b) => a.sortValue - b.sortValue);

    const payoutSplit = prizeConfig.payoutSplit;

    // Get the week number for descriptions
    const { data: week } = await supabase
      .from('league_weeks')
      .select('week_number')
      .eq('id', weekId)
      .single();
    const weekNum = week?.week_number || '?';

    const payoutEntries: any[] = [];
    for (let i = 0; i < Math.min(payoutSplit.length, ranked.length); i++) {
      const { place, pct } = payoutSplit[i];
      const amount = Math.round((weeklyPot * pct / 100) * 100) / 100; // round to cents

      if (amount <= 0) continue;

      payoutEntries.push({
        league_id: leagueId,
        league_week_id: weekId,
        league_player_id: ranked[i].playerId,
        type: 'payout',
        amount: -amount, // negative = money out
        description: `${this.ordinal(place)} place - Week ${weekNum} ($${amount.toFixed(2)})`,
        payout_status: 'pending',
        placement: place,
      });
    }

    if (payoutEntries.length === 0) return [];

    const { data: inserted, error: insertError } = await supabase
      .from('league_prize_ledger')
      .insert(payoutEntries)
      .select();

    if (insertError) {
      throw new Error(`Failed to generate payouts: ${insertError.message}`);
    }

    return inserted || [];
  }

  async confirmPayout(ledgerEntryId: string, confirmedBy: string): Promise<void> {
    const { error } = await supabase
      .from('league_prize_ledger')
      .update({
        payout_status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: confirmedBy,
      })
      .eq('id', ledgerEntryId)
      .eq('type', 'payout');

    if (error) {
      throw new Error(`Failed to confirm payout: ${error.message}`);
    }
  }

  async confirmWeekPayouts(leagueId: string, weekId: string, confirmedBy: string): Promise<void> {
    // Mark all pending payouts for this week as paid
    const { error: ledgerError } = await supabase
      .from('league_prize_ledger')
      .update({
        payout_status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: confirmedBy,
      })
      .eq('league_week_id', weekId)
      .eq('league_id', leagueId)
      .eq('type', 'payout')
      .eq('payout_status', 'pending');

    if (ledgerError) {
      throw new Error(`Failed to confirm week payouts: ${ledgerError.message}`);
    }

    // Mark the week as payouts confirmed
    const { error: weekError } = await supabase
      .from('league_weeks')
      .update({ payouts_confirmed: true })
      .eq('id', weekId);

    if (weekError) {
      throw new Error(`Failed to mark week payouts as confirmed: ${weekError.message}`);
    }
  }

  async getPrizePoolSummary(leagueId: string): Promise<PrizePoolSummary> {
    // Get all ledger entries
    const { data: entries, error } = await supabase
      .from('league_prize_ledger')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to get prize pool summary: ${error.message}`);

    const allEntries = entries || [];

    const totalCollected = allEntries
      .filter(e => e.type === 'contribution')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalPaidOut = allEntries
      .filter(e => e.type === 'payout' && e.payout_status === 'paid')
      .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

    const totalPending = allEntries
      .filter(e => e.type === 'payout' && e.payout_status === 'pending')
      .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

    // Get week-by-week breakdown
    const { data: weeks } = await supabase
      .from('league_weeks')
      .select('id, week_number, date, prize_pool_total, payouts_confirmed')
      .eq('league_id', leagueId)
      .order('week_number', { ascending: true });

    // Batch fetch all player names for payout entries
    const payoutPlayerIds = [...new Set(allEntries.filter(e => e.type === 'payout').map(e => e.league_player_id))];
    let globalNameMap = new Map<string, string>();
    if (payoutPlayerIds.length > 0) {
      const { data: players } = await supabase
        .from('league_players')
        .select('id, display_name')
        .in('id', payoutPlayerIds);
      globalNameMap = new Map((players || []).map((p: any) => [p.id, p.display_name]));
    }

    const weeklyBreakdown: WeekPayoutSummary[] = [];

    for (const week of (weeks || [])) {
      const weekPayouts = allEntries
        .filter(e => e.league_week_id === week.id && e.type === 'payout')
        .map(e => ({
          playerId: e.league_player_id,
          playerName: globalNameMap.get(e.league_player_id) || 'Unknown',
          placement: e.placement || 0,
          amount: Math.abs(Number(e.amount)),
          status: e.payout_status || 'pending',
        }));

      weeklyBreakdown.push({
        weekId: week.id,
        weekNumber: week.week_number,
        date: week.date,
        prizePoolTotal: Number(week.prize_pool_total) || 0,
        payoutsConfirmed: week.payouts_confirmed || false,
        payouts: weekPayouts.sort((a, b) => a.placement - b.placement),
      });
    }

    return {
      totalCollected,
      totalPaidOut,
      totalPending,
      balance: totalCollected - totalPaidOut - totalPending,
      weeklyBreakdown,
    };
  }

  async getPlayerPrizeHistory(leagueId: string, playerId: string): Promise<PrizeLedgerEntry[]> {
    const { data, error } = await supabase
      .from('league_prize_ledger')
      .select('*')
      .eq('league_id', leagueId)
      .eq('league_player_id', playerId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get player prize history: ${error.message}`);
    return data || [];
  }

  async insertPrizeContribution(
    leagueId: string,
    leaguePlayerId: string,
    amount: number,
    description: string
  ): Promise<void> {
    const { error } = await supabase
      .from('league_prize_ledger')
      .insert({
        league_id: leagueId,
        league_player_id: leaguePlayerId,
        type: 'contribution',
        amount, // positive for money in
        description,
      });

    if (error) {
      logger.error({ err: error }, 'Failed to insert prize contribution');
      // Don't throw — contribution tracking failure shouldn't break enrollment
    }
  }

  private ordinal(n: number): string {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }
}
