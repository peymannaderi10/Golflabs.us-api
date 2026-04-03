import { supabase } from '../../config/database';
import { stripe, getOrCreateCustomerForLocation, getStripeOptions } from '../../config/stripe';
import { logger } from '../../shared/utils/logger';
import {
  League,
  LeaguePlayer,
  EnrollPlayerRequest,
  OverrideHandicapRequest,
  PrizePoolConfig,
} from './league.types';

export class LeagueEnrollmentService {

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
        current_handicap: data.initialHandicap || 0,
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
      logger.error({ err: standingsError }, 'Failed to create standings row');
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

  async searchPlayers(leagueId: string, query?: string): Promise<any[]> {
    // Get the league to know num_holes
    const { data: league } = await supabase
      .from('leagues')
      .select('num_holes')
      .eq('id', leagueId)
      .single();

    const numHoles = league?.num_holes || 9;

    // Get active/scoring week
    const { data: activeWeek } = await supabase
      .from('league_weeks')
      .select('id')
      .eq('league_id', leagueId)
      .in('status', ['active', 'scoring'])
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    // Get players
    let q = supabase
      .from('league_players')
      .select('id, display_name, current_handicap, user_id')
      .eq('league_id', leagueId)
      .eq('enrollment_status', 'active')
      .order('display_name')
      .limit(50);

    if (query && query.trim()) {
      q = q.ilike('display_name', `%${query.trim()}%`);
    }

    const { data: players, error } = await q;
    if (error) {
      throw new Error(`Failed to search players: ${error.message}`);
    }

    if (!players || players.length === 0 || !activeWeek) {
      return (players || []).map(p => ({ ...p, round_complete: false }));
    }

    // Get score counts per player for the active week
    const playerIds = players.map(p => p.id);
    const { data: scores } = await supabase
      .from('league_scores')
      .select('league_player_id')
      .eq('league_week_id', activeWeek.id)
      .in('league_player_id', playerIds);

    const scoreCounts: Record<string, number> = {};
    for (const s of (scores || [])) {
      scoreCounts[s.league_player_id] = (scoreCounts[s.league_player_id] || 0) + 1;
    }

    return players.map(p => ({
      ...p,
      round_complete: (scoreCounts[p.id] || 0) >= numHoles,
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

  async enrollAndPay(leagueId: string, userId: string, displayName: string, initialHandicap: number = 0): Promise<{ clientSecret: string; playerId: string }> {
    const league = await this.getLeague(leagueId);

    if (league.status !== 'registration' && league.status !== 'active') {
      throw new Error('League is not accepting enrollments');
    }

    // Check members-only restriction
    if (league.members_only) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('id')
        .eq('user_id', userId)
        .eq('location_id', league.location_id)
        .in('status', ['active', 'trialing'])
        .limit(1)
        .maybeSingle();

      if (!membership) {
        throw new Error('This league is for members only. Please sign up for a membership first.');
      }
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
        current_handicap: initialHandicap,
        enrollment_status: 'pending',
        season_paid: false,
        prize_pot_paid: false,
      }, { onConflict: 'league_id,user_id' })
      .select()
      .single();

    if (playerError || !player) {
      throw new Error(`Failed to create player record: ${playerError?.message}`);
    }

    // Calculate total amount: season fee + full prize pot for the entire season
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;
    const buyIn = prizeConfig?.enabled ? prizeConfig.buyInPerSession : 0;
    const totalPrizePot = buyIn * league.total_weeks;
    const totalAmount = (league.season_fee + totalPrizePot) * 100; // cents

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

    // Get or create Stripe customer scoped to the correct account
    const { customerId: stripeCustomerId, stripeOpts } = await getOrCreateCustomerForLocation(userId, league.location_id);

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
        prize_pot_per_week: String(buyIn),
        prize_pot_total: String(totalPrizePot),
      },
    }, stripeOpts);

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

  async overrideHandicap(
    leagueId: string,
    playerId: string,
    newHandicap: number,
    overriddenBy: string,
    reason: string
  ): Promise<void> {
    // Get current handicap
    const { data: player, error: playerError } = await supabase
      .from('league_players')
      .select('current_handicap')
      .eq('id', playerId)
      .eq('league_id', leagueId)
      .single();

    if (playerError || !player) {
      throw new Error(`Player not found: ${playerError?.message}`);
    }

    const oldHandicap = player.current_handicap;

    // Update the handicap (scoped to league for safety)
    const { error } = await supabase
      .from('league_players')
      .update({ current_handicap: newHandicap })
      .eq('id', playerId)
      .eq('league_id', leagueId);

    if (error) {
      throw new Error(`Failed to override handicap: ${error.message}`);
    }

    // Record in history with manual override flag
    await supabase
      .from('handicap_history')
      .insert({
        league_player_id: playerId,
        old_handicap: oldHandicap,
        new_handicap: newHandicap,
        calculation_details: {
          type: 'manual_override',
          reason,
          overridden_by: overriddenBy,
          differentials: [],
          best_used: [],
          average: 0,
          multiplier: 0,
        },
      });
  }

  // =====================================================
  // REFUNDS
  // =====================================================

  /**
   * Refund a single week's prize buy-in for a no-show.
   */
  async refundWeeklyBuyIn(
    leagueId: string,
    playerId: string,
    reason: string,
    issuedBy: string
  ): Promise<{ refundId: string; amount: number }> {
    const league = await this.getLeague(leagueId);
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;
    const buyIn = prizeConfig?.enabled ? prizeConfig.buyInPerSession : 0;

    if (buyIn <= 0) {
      throw new Error('No prize pool buy-in configured for this league');
    }

    const { data: player } = await supabase
      .from('league_players')
      .select('id, stripe_payment_intent_id, display_name, user_id')
      .eq('id', playerId)
      .eq('league_id', leagueId)
      .single();

    if (!player) throw new Error('Player not found');
    if (!player.stripe_payment_intent_id) throw new Error('No payment on file for this player');

    const amountCents = Math.round(buyIn * 100);
    const stripeOpts = await getStripeOptions(league.location_id);

    const refund = await stripe.refunds.create({
      payment_intent: player.stripe_payment_intent_id,
      amount: amountCents,
      reason: 'requested_by_customer',
      metadata: {
        type: 'league_weekly_refund',
        league_id: leagueId,
        league_player_id: playerId,
        reason,
        issued_by: issuedBy,
      },
    }, stripeOpts);

    // Record in prize ledger
    await supabase.from('league_prize_ledger').insert({
      league_id: leagueId,
      league_player_id: playerId,
      type: 'refund',
      amount: buyIn,
      description: `Weekly no-show refund: ${reason}`,
      payout_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: issuedBy,
    });

    logger.info({ leagueId, playerId, amount: buyIn, refundId: refund.id }, 'Weekly buy-in refund issued');
    return { refundId: refund.id, amount: buyIn };
  }

  /**
   * Remove a player from the league with optional prorated refund.
   */
  async removeAndRefund(
    leagueId: string,
    playerId: string,
    refundType: 'full' | 'prorated' | 'none',
    reason: string,
    issuedBy: string
  ): Promise<{ refundId?: string; amount: number; withdrawn: boolean }> {
    const league = await this.getLeague(leagueId);

    const { data: player } = await supabase
      .from('league_players')
      .select('id, stripe_payment_intent_id, display_name, user_id')
      .eq('id', playerId)
      .eq('league_id', leagueId)
      .neq('enrollment_status', 'withdrawn')
      .single();

    if (!player) throw new Error('Player not found or already withdrawn');

    // Calculate refund amount
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;
    const buyIn = prizeConfig?.enabled ? prizeConfig.buyInPerSession : 0;
    const totalPaid = league.season_fee + (buyIn * league.total_weeks);

    // Count distinct weeks played
    const { data: weekRows } = await supabase
      .from('league_scores')
      .select('league_week_id')
      .eq('league_player_id', playerId);

    const uniqueWeeksPlayed = new Set(weekRows?.map(r => r.league_week_id) ?? []).size;
    const remainingWeeks = Math.max(0, league.total_weeks - uniqueWeeksPlayed);

    let refundAmount = 0;
    if (refundType === 'full') {
      refundAmount = totalPaid;
    } else if (refundType === 'prorated') {
      const perWeekCost = league.total_weeks > 0 ? totalPaid / league.total_weeks : 0;
      refundAmount = Math.round(perWeekCost * remainingWeeks * 100) / 100;
    }

    let refundId: string | undefined;

    // Process Stripe refund BEFORE withdrawal so we can rollback if it fails
    if (refundAmount > 0 && player.stripe_payment_intent_id) {
      const amountCents = Math.round(refundAmount * 100);
      const stripeOpts = await getStripeOptions(league.location_id);

      // Verify refund won't exceed original payment
      try {
        const pi = await stripe.paymentIntents.retrieve(player.stripe_payment_intent_id, stripeOpts);
        const alreadyRefunded = (pi as any).amount_refunded || 0;
        if (alreadyRefunded + amountCents > pi.amount) {
          throw new Error(`Refund of $${refundAmount.toFixed(2)} would exceed the original payment of $${(pi.amount / 100).toFixed(2)} (already refunded $${(alreadyRefunded / 100).toFixed(2)})`);
        }
      } catch (err: any) {
        if (err.message.includes('would exceed')) throw err;
        logger.warn({ err, playerId }, 'Could not verify PaymentIntent before refund');
      }

      const refund = await stripe.refunds.create({
        payment_intent: player.stripe_payment_intent_id,
        amount: amountCents,
        reason: 'requested_by_customer',
        metadata: {
          type: 'league_withdrawal_refund',
          refund_type: refundType,
          league_id: leagueId,
          league_player_id: playerId,
          reason,
          issued_by: issuedBy,
        },
      }, stripeOpts);
      refundId = refund.id;

      // Record in prize ledger
      await supabase.from('league_prize_ledger').insert({
        league_id: leagueId,
        league_player_id: playerId,
        type: 'refund',
        amount: refundAmount,
        description: `${refundType === 'full' ? 'Full' : 'Prorated'} withdrawal refund: ${reason}`,
        payout_status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: issuedBy,
      });
    }

    // Withdraw the player AFTER successful refund (or if no refund needed)
    await supabase
      .from('league_players')
      .update({ enrollment_status: 'withdrawn' })
      .eq('id', playerId)
      .eq('league_id', leagueId);

    logger.info({ leagueId, playerId, refundType, amount: refundAmount, refundId }, 'Player removed from league');
    return { refundId, amount: refundAmount, withdrawn: true };
  }
}
