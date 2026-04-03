"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeagueEnrollmentService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const logger_1 = require("../../shared/utils/logger");
class LeagueEnrollmentService {
    getLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('id', leagueId)
                .is('deleted_at', null)
                .single();
            if (error || !data)
                throw new Error(`League not found: ${error === null || error === void 0 ? void 0 : error.message}`);
            return data;
        });
    }
    enrollPlayer(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Check capacity
            const { count, error: countError } = yield database_1.supabase
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
            const { data: player, error } = yield database_1.supabase
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
                if ((error === null || error === void 0 ? void 0 : error.code) === '23505') {
                    throw new Error('Player is already enrolled in this league');
                }
                throw new Error(`Failed to enroll player: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Create initial standings row
            const { error: standingsError } = yield database_1.supabase
                .from('league_standings')
                .insert({
                league_id: leagueId,
                league_player_id: player.id,
            });
            if (standingsError) {
                logger_1.logger.error({ err: standingsError }, 'Failed to create standings row');
            }
            return player;
        });
    }
    getPlayers(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_players')
                .select('*, user_profiles(email)')
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn')
                .order('display_name');
            if (error) {
                throw new Error(`Failed to fetch players: ${error.message}`);
            }
            return (data || []).map((p) => {
                var _a;
                return (Object.assign(Object.assign({}, p), { email: (_a = p.user_profiles) === null || _a === void 0 ? void 0 : _a.email, user_profiles: undefined }));
            });
        });
    }
    searchPlayers(leagueId, query) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get the league to know num_holes
            const { data: league } = yield database_1.supabase
                .from('leagues')
                .select('num_holes')
                .eq('id', leagueId)
                .single();
            const numHoles = (league === null || league === void 0 ? void 0 : league.num_holes) || 9;
            // Get active/scoring week
            const { data: activeWeek } = yield database_1.supabase
                .from('league_weeks')
                .select('id')
                .eq('league_id', leagueId)
                .in('status', ['active', 'scoring'])
                .order('week_number', { ascending: false })
                .limit(1)
                .single();
            // Get players
            let q = database_1.supabase
                .from('league_players')
                .select('id, display_name, current_handicap, user_id')
                .eq('league_id', leagueId)
                .eq('enrollment_status', 'active')
                .order('display_name')
                .limit(50);
            if (query && query.trim()) {
                q = q.ilike('display_name', `%${query.trim()}%`);
            }
            const { data: players, error } = yield q;
            if (error) {
                throw new Error(`Failed to search players: ${error.message}`);
            }
            if (!players || players.length === 0 || !activeWeek) {
                return (players || []).map(p => (Object.assign(Object.assign({}, p), { round_complete: false })));
            }
            // Get score counts per player for the active week
            const playerIds = players.map(p => p.id);
            const { data: scores } = yield database_1.supabase
                .from('league_scores')
                .select('league_player_id')
                .eq('league_week_id', activeWeek.id)
                .in('league_player_id', playerIds);
            const scoreCounts = {};
            for (const s of (scores || [])) {
                scoreCounts[s.league_player_id] = (scoreCounts[s.league_player_id] || 0) + 1;
            }
            return players.map(p => (Object.assign(Object.assign({}, p), { round_complete: (scoreCounts[p.id] || 0) >= numHoles })));
        });
    }
    withdrawPlayer(leagueId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_players')
                .update({ enrollment_status: 'withdrawn' })
                .eq('id', playerId)
                .eq('league_id', leagueId);
            if (error) {
                throw new Error(`Failed to withdraw player: ${error.message}`);
            }
        });
    }
    enrollAndPay(leagueId_1, userId_1, displayName_1) {
        return __awaiter(this, arguments, void 0, function* (leagueId, userId, displayName, initialHandicap = 0) {
            const league = yield this.getLeague(leagueId);
            if (league.status !== 'registration' && league.status !== 'active') {
                throw new Error('League is not accepting enrollments');
            }
            // Check members-only restriction
            if (league.members_only) {
                const { data: membership } = yield database_1.supabase
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
            const { count } = yield database_1.supabase
                .from('league_players')
                .select('*', { count: 'exact', head: true })
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn');
            if (count !== null && count >= league.max_players) {
                throw new Error('League is full');
            }
            // Check if already enrolled
            const { data: existing } = yield database_1.supabase
                .from('league_players')
                .select('id, enrollment_status')
                .eq('league_id', leagueId)
                .eq('user_id', userId)
                .single();
            if (existing && existing.enrollment_status !== 'withdrawn') {
                throw new Error('Player is already enrolled in this league');
            }
            // Create pending player record
            const { data: player, error: playerError } = yield database_1.supabase
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
                throw new Error(`Failed to create player record: ${playerError === null || playerError === void 0 ? void 0 : playerError.message}`);
            }
            // Calculate total amount: season fee + full prize pot for the entire season
            const prizeConfig = league.prize_pool_config;
            const buyIn = (prizeConfig === null || prizeConfig === void 0 ? void 0 : prizeConfig.enabled) ? prizeConfig.buyInPerSession : 0;
            const totalPrizePot = buyIn * league.total_weeks;
            const totalAmount = (league.season_fee + totalPrizePot) * 100; // cents
            if (totalAmount === 0) {
                // Free league — activate immediately
                yield database_1.supabase
                    .from('league_players')
                    .update({ enrollment_status: 'active', season_paid: true, prize_pot_paid: true })
                    .eq('id', player.id);
                yield database_1.supabase
                    .from('league_standings')
                    .upsert({ league_id: leagueId, league_player_id: player.id }, { onConflict: 'league_id,league_player_id' });
                return { clientSecret: '', playerId: player.id };
            }
            // Get or create Stripe customer scoped to the correct account
            const { customerId: stripeCustomerId, stripeOpts } = yield (0, stripe_1.getOrCreateCustomerForLocation)(userId, league.location_id);
            // Create PaymentIntent
            const paymentIntent = yield stripe_1.stripe.paymentIntents.create({
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
            yield database_1.supabase
                .from('league_players')
                .update({ stripe_payment_intent_id: paymentIntent.id })
                .eq('id', player.id);
            return {
                clientSecret: paymentIntent.client_secret,
                playerId: player.id,
            };
        });
    }
    overrideHandicap(leagueId, playerId, newHandicap, overriddenBy, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get current handicap
            const { data: player, error: playerError } = yield database_1.supabase
                .from('league_players')
                .select('current_handicap')
                .eq('id', playerId)
                .eq('league_id', leagueId)
                .single();
            if (playerError || !player) {
                throw new Error(`Player not found: ${playerError === null || playerError === void 0 ? void 0 : playerError.message}`);
            }
            const oldHandicap = player.current_handicap;
            // Update the handicap (scoped to league for safety)
            const { error } = yield database_1.supabase
                .from('league_players')
                .update({ current_handicap: newHandicap })
                .eq('id', playerId)
                .eq('league_id', leagueId);
            if (error) {
                throw new Error(`Failed to override handicap: ${error.message}`);
            }
            // Record in history with manual override flag
            yield database_1.supabase
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
        });
    }
    // =====================================================
    // REFUNDS
    // =====================================================
    /**
     * Refund a single week's prize buy-in for a no-show.
     */
    refundWeeklyBuyIn(leagueId, playerId, reason, issuedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            const prizeConfig = league.prize_pool_config;
            const buyIn = (prizeConfig === null || prizeConfig === void 0 ? void 0 : prizeConfig.enabled) ? prizeConfig.buyInPerSession : 0;
            if (buyIn <= 0) {
                throw new Error('No prize pool buy-in configured for this league');
            }
            const { data: player } = yield database_1.supabase
                .from('league_players')
                .select('id, stripe_payment_intent_id, display_name, user_id')
                .eq('id', playerId)
                .eq('league_id', leagueId)
                .single();
            if (!player)
                throw new Error('Player not found');
            if (!player.stripe_payment_intent_id)
                throw new Error('No payment on file for this player');
            const amountCents = Math.round(buyIn * 100);
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(league.location_id);
            const refund = yield stripe_1.stripe.refunds.create({
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
            yield database_1.supabase.from('league_prize_ledger').insert({
                league_id: leagueId,
                league_player_id: playerId,
                type: 'refund',
                amount: buyIn,
                description: `Weekly no-show refund: ${reason}`,
                payout_status: 'paid',
                paid_at: new Date().toISOString(),
                paid_by: issuedBy,
            });
            logger_1.logger.info({ leagueId, playerId, amount: buyIn, refundId: refund.id }, 'Weekly buy-in refund issued');
            return { refundId: refund.id, amount: buyIn };
        });
    }
    /**
     * Remove a player from the league with optional prorated refund.
     */
    removeAndRefund(leagueId, playerId, refundType, reason, issuedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const league = yield this.getLeague(leagueId);
            const { data: player } = yield database_1.supabase
                .from('league_players')
                .select('id, stripe_payment_intent_id, display_name, user_id')
                .eq('id', playerId)
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn')
                .single();
            if (!player)
                throw new Error('Player not found or already withdrawn');
            // Calculate refund amount
            const prizeConfig = league.prize_pool_config;
            const buyIn = (prizeConfig === null || prizeConfig === void 0 ? void 0 : prizeConfig.enabled) ? prizeConfig.buyInPerSession : 0;
            const totalPaid = league.season_fee + (buyIn * league.total_weeks);
            // Count distinct weeks played
            const { data: weekRows } = yield database_1.supabase
                .from('league_scores')
                .select('league_week_id')
                .eq('league_player_id', playerId);
            const uniqueWeeksPlayed = new Set((_a = weekRows === null || weekRows === void 0 ? void 0 : weekRows.map(r => r.league_week_id)) !== null && _a !== void 0 ? _a : []).size;
            const remainingWeeks = Math.max(0, league.total_weeks - uniqueWeeksPlayed);
            let refundAmount = 0;
            if (refundType === 'full') {
                refundAmount = totalPaid;
            }
            else if (refundType === 'prorated') {
                const perWeekCost = league.total_weeks > 0 ? totalPaid / league.total_weeks : 0;
                refundAmount = Math.round(perWeekCost * remainingWeeks * 100) / 100;
            }
            let refundId;
            // Process Stripe refund BEFORE withdrawal so we can rollback if it fails
            if (refundAmount > 0 && player.stripe_payment_intent_id) {
                const amountCents = Math.round(refundAmount * 100);
                const stripeOpts = yield (0, stripe_1.getStripeOptions)(league.location_id);
                // Verify refund won't exceed original payment
                try {
                    const pi = yield stripe_1.stripe.paymentIntents.retrieve(player.stripe_payment_intent_id, stripeOpts);
                    const alreadyRefunded = pi.amount_refunded || 0;
                    if (alreadyRefunded + amountCents > pi.amount) {
                        throw new Error(`Refund of $${refundAmount.toFixed(2)} would exceed the original payment of $${(pi.amount / 100).toFixed(2)} (already refunded $${(alreadyRefunded / 100).toFixed(2)})`);
                    }
                }
                catch (err) {
                    if (err.message.includes('would exceed'))
                        throw err;
                    logger_1.logger.warn({ err, playerId }, 'Could not verify PaymentIntent before refund');
                }
                const refund = yield stripe_1.stripe.refunds.create({
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
                yield database_1.supabase.from('league_prize_ledger').insert({
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
            yield database_1.supabase
                .from('league_players')
                .update({ enrollment_status: 'withdrawn' })
                .eq('id', playerId)
                .eq('league_id', leagueId);
            logger_1.logger.info({ leagueId, playerId, refundType, amount: refundAmount, refundId }, 'Player removed from league');
            return { refundId, amount: refundAmount, withdrawn: true };
        });
    }
}
exports.LeagueEnrollmentService = LeagueEnrollmentService;
