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
exports.LeagueTeamService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const logger_1 = require("../../shared/utils/logger");
const email_service_1 = require("../email/email.service");
const team_scoring_utils_1 = require("./team-scoring.utils");
class LeagueTeamService {
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
    createTeam(leagueId, captainUserId, teamName) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.format !== 'team') {
                throw new Error('This league does not support teams');
            }
            if (league.status !== 'registration' && league.status !== 'active') {
                throw new Error('League is not accepting teams');
            }
            // Check if captain is already on a team in this league
            const { data: existingPlayer } = yield database_1.supabase
                .from('league_players')
                .select('id, league_team_id')
                .eq('league_id', leagueId)
                .eq('user_id', captainUserId)
                .neq('enrollment_status', 'withdrawn')
                .single();
            if (existingPlayer && existingPlayer.league_team_id) {
                throw new Error('You are already on a team in this league');
            }
            // Get captain's display name
            const { data: userProfile } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', captainUserId)
                .single();
            if (!userProfile) {
                throw new Error('User not found');
            }
            // Create the team
            const { data: team, error } = yield database_1.supabase
                .from('league_teams')
                .insert({
                league_id: leagueId,
                team_name: teamName,
                captain_user_id: captainUserId,
                players_per_team: league.players_per_team,
                status: 'forming',
            })
                .select()
                .single();
            if (error || !team) {
                if ((error === null || error === void 0 ? void 0 : error.code) === '23505') {
                    throw new Error('A team with that name already exists in this league');
                }
                throw new Error(`Failed to create team: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Create league_player record for the captain, linked to the team
            if (existingPlayer) {
                // Update existing player record to link to team
                yield database_1.supabase
                    .from('league_players')
                    .update({ league_team_id: team.id })
                    .eq('id', existingPlayer.id);
            }
            else {
                const { error: playerError } = yield database_1.supabase
                    .from('league_players')
                    .insert({
                    league_id: leagueId,
                    user_id: captainUserId,
                    display_name: userProfile.full_name || userProfile.email,
                    enrollment_status: 'pending',
                    season_paid: false,
                    prize_pot_paid: false,
                    league_team_id: team.id,
                });
                if (playerError) {
                    logger_1.logger.error({ err: playerError }, 'Failed to create captain player record');
                }
            }
            return team;
        });
    }
    inviteTeammates(teamId, captainUserId, emails) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Verify team exists and user is captain
            const { data: team, error: teamError } = yield database_1.supabase
                .from('league_teams')
                .select('*, leagues(id, name, players_per_team, total_weeks, season_fee, weekly_prize_pot, prize_pool_config, num_holes, location_id)')
                .eq('id', teamId)
                .single();
            if (teamError || !team) {
                throw new Error('Team not found');
            }
            if (team.captain_user_id !== captainUserId) {
                throw new Error('Only the team captain can invite teammates');
            }
            if (team.status !== 'forming') {
                throw new Error('Team is no longer accepting invites');
            }
            const league = team.leagues;
            // Check how many slots remain
            const { count: existingInvites } = yield database_1.supabase
                .from('league_team_invites')
                .select('id', { count: 'exact', head: true })
                .eq('league_team_id', teamId)
                .in('status', ['pending', 'accepted']);
            const { count: existingMembers } = yield database_1.supabase
                .from('league_players')
                .select('id', { count: 'exact', head: true })
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            const totalSlotsTaken = (existingMembers || 0);
            const maxNeeded = league.players_per_team - totalSlotsTaken;
            if (emails.length > maxNeeded) {
                throw new Error(`Team only has ${maxNeeded} open slot(s). You tried to invite ${emails.length} player(s).`);
            }
            const invited = [];
            const errors = [];
            for (const email of emails) {
                const normalizedEmail = email.toLowerCase().trim();
                // Find user by email
                const { data: user } = yield database_1.supabase
                    .from('user_profiles')
                    .select('id, full_name, email')
                    .eq('email', normalizedEmail)
                    .single();
                if (!user) {
                    errors.push({ email: normalizedEmail, reason: 'No account found with this email' });
                    continue;
                }
                if (user.id === captainUserId) {
                    errors.push({ email: normalizedEmail, reason: 'You cannot invite yourself' });
                    continue;
                }
                // Check if already invited to this team
                const { data: existingInvite } = yield database_1.supabase
                    .from('league_team_invites')
                    .select('id, status')
                    .eq('league_team_id', teamId)
                    .eq('invited_user_id', user.id)
                    .in('status', ['pending', 'accepted'])
                    .single();
                if (existingInvite) {
                    errors.push({ email: normalizedEmail, reason: 'Already invited to this team' });
                    continue;
                }
                // Check if already on another team in this league
                const { data: otherTeamPlayer } = yield database_1.supabase
                    .from('league_players')
                    .select('id, league_team_id')
                    .eq('league_id', team.league_id)
                    .eq('user_id', user.id)
                    .neq('enrollment_status', 'withdrawn')
                    .not('league_team_id', 'is', null)
                    .single();
                if (otherTeamPlayer) {
                    errors.push({ email: normalizedEmail, reason: 'Already on a team in this league' });
                    continue;
                }
                // Create invite
                const { data: invite, error: inviteError } = yield database_1.supabase
                    .from('league_team_invites')
                    .insert({
                    league_team_id: teamId,
                    invited_user_id: user.id,
                    invited_email: normalizedEmail,
                    status: 'pending',
                })
                    .select()
                    .single();
                if (inviteError || !invite) {
                    errors.push({ email: normalizedEmail, reason: `Failed to create invite: ${inviteError === null || inviteError === void 0 ? void 0 : inviteError.message}` });
                    continue;
                }
                invited.push(invite);
                // Send invite email (fire-and-forget)
                const frontendUrl = process.env.FRONTEND_URL || 'https://app.golflabs.us';
                const captainProfile = yield database_1.supabase
                    .from('user_profiles')
                    .select('full_name')
                    .eq('id', captainUserId)
                    .single();
                email_service_1.EmailService.sendTeamInviteEmail(league.location_id, {
                    invitedUserName: user.full_name || user.email,
                    invitedEmail: normalizedEmail,
                    captainName: ((_a = captainProfile.data) === null || _a === void 0 ? void 0 : _a.full_name) || 'Your teammate',
                    teamName: team.team_name,
                    leagueName: league.name,
                    seasonFee: league.season_fee || 0,
                    weeklyPrizePot: (((_b = league.prize_pool_config) === null || _b === void 0 ? void 0 : _b.enabled) ? league.prize_pool_config.buyInPerSession : 0),
                    totalWeeks: league.total_weeks || 0,
                    numHoles: league.num_holes || 9,
                    playersPerTeam: league.players_per_team,
                    acceptUrl: `${frontendUrl}/team-invite/${invite.invite_token}`,
                    declineUrl: `${frontendUrl}/team-invite/${invite.invite_token}?action=decline`,
                }).catch(err => logger_1.logger.error({ err }, 'Failed to send team invite email'));
            }
            return { invited, errors };
        });
    }
    acceptInvite(inviteToken, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Find the invite by token
            const { data: invite, error: inviteError } = yield database_1.supabase
                .from('league_team_invites')
                .select('*, league_teams(*, leagues(*))')
                .eq('invite_token', inviteToken)
                .single();
            if (inviteError || !invite) {
                throw new Error('Invite not found or invalid token');
            }
            if (invite.status !== 'pending') {
                throw new Error(`Invite has already been ${invite.status}`);
            }
            if (invite.invited_user_id !== userId) {
                throw new Error('This invite was not sent to you');
            }
            const team = invite.league_teams;
            const league = team === null || team === void 0 ? void 0 : team.leagues;
            if (!team || !league) {
                throw new Error('Team or league not found');
            }
            // Accept the invite
            const { data: updatedInvite, error: updateError } = yield database_1.supabase
                .from('league_team_invites')
                .update({
                status: 'accepted',
                responded_at: new Date().toISOString(),
            })
                .eq('id', invite.id)
                .select()
                .single();
            if (updateError || !updatedInvite) {
                throw new Error(`Failed to accept invite: ${updateError === null || updateError === void 0 ? void 0 : updateError.message}`);
            }
            // Get user profile for display name
            const { data: userProfile } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', userId)
                .single();
            // Create league_player record (pending - payment not yet done)
            const { error: playerError } = yield database_1.supabase
                .from('league_players')
                .upsert({
                league_id: team.league_id,
                user_id: userId,
                display_name: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.full_name) || (userProfile === null || userProfile === void 0 ? void 0 : userProfile.email) || 'Unknown',
                enrollment_status: 'pending',
                season_paid: false,
                prize_pot_paid: false,
                league_team_id: team.id,
            }, { onConflict: 'league_id,user_id' });
            if (playerError) {
                logger_1.logger.error({ err: playerError }, 'Failed to create player record on invite accept');
            }
            // Check if all invites are now accepted
            yield this.checkAndTransitionTeamStatus(team.id);
            return { team, invite: updatedInvite };
        });
    }
    declineInvite(inviteToken, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: invite, error: inviteError } = yield database_1.supabase
                .from('league_team_invites')
                .select('*')
                .eq('invite_token', inviteToken)
                .single();
            if (inviteError || !invite) {
                throw new Error('Invite not found or invalid token');
            }
            if (invite.status !== 'pending') {
                throw new Error(`Invite has already been ${invite.status}`);
            }
            if (invite.invited_user_id !== userId) {
                throw new Error('This invite was not sent to you');
            }
            yield database_1.supabase
                .from('league_team_invites')
                .update({
                status: 'declined',
                responded_at: new Date().toISOString(),
            })
                .eq('id', invite.id);
        });
    }
    getInviteByToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data, error } = yield database_1.supabase
                .from('league_team_invites')
                .select('*, league_teams(team_name, captain_user_id, status, league_id, leagues(name, season_fee, weekly_prize_pot, prize_pool_config, total_weeks, start_time, num_holes, format, players_per_team, team_scoring_format))')
                .eq('invite_token', token)
                .single();
            if (error || !data) {
                throw new Error('Invite not found');
            }
            const team = data.league_teams;
            const league = team === null || team === void 0 ? void 0 : team.leagues;
            // Get captain name
            const { data: captain } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name')
                .eq('id', team.captain_user_id)
                .single();
            return {
                id: data.id,
                status: data.status,
                invitedEmail: data.invited_email,
                invitedUserId: data.invited_user_id,
                inviteToken: data.invite_token,
                teamName: team.team_name,
                teamStatus: team.status,
                captainName: (captain === null || captain === void 0 ? void 0 : captain.full_name) || 'Unknown',
                league: league ? {
                    id: league.id || team.league_id,
                    name: league.name,
                    seasonFee: league.season_fee,
                    weeklyPrizePot: (((_a = league.prize_pool_config) === null || _a === void 0 ? void 0 : _a.enabled) ? league.prize_pool_config.buyInPerSession : 0),
                    totalWeeks: league.total_weeks,
                    startTime: league.start_time,
                    numHoles: league.num_holes,
                    format: league.format,
                    playersPerTeam: league.players_per_team,
                    teamScoringFormat: league.team_scoring_format,
                } : null,
            };
        });
    }
    checkAndTransitionTeamStatus(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: team } = yield database_1.supabase
                .from('league_teams')
                .select('*, leagues(players_per_team)')
                .eq('id', teamId)
                .single();
            if (!team)
                return;
            const playersPerTeam = ((_a = team.leagues) === null || _a === void 0 ? void 0 : _a.players_per_team) || team.players_per_team;
            // Count current members (league_players linked to this team, not withdrawn)
            const { count: memberCount } = yield database_1.supabase
                .from('league_players')
                .select('id', { count: 'exact', head: true })
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            // If team is full, move to pending_payment
            if ((memberCount || 0) >= playersPerTeam && team.status === 'forming') {
                yield database_1.supabase
                    .from('league_teams')
                    .update({ status: 'pending_payment' })
                    .eq('id', teamId);
            }
        });
    }
    getTeams(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: teams, error } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('league_id', leagueId)
                .order('created_at', { ascending: true });
            if (error) {
                throw new Error(`Failed to fetch teams: ${error.message}`);
            }
            // Enrich with members and invites
            const enrichedTeams = [];
            for (const team of (teams || [])) {
                // Get captain name
                const { data: captain } = yield database_1.supabase
                    .from('user_profiles')
                    .select('full_name')
                    .eq('id', team.captain_user_id)
                    .single();
                // Get team members
                const { data: members } = yield database_1.supabase
                    .from('league_players')
                    .select('id, user_id, display_name, enrollment_status, season_paid, prize_pot_paid')
                    .eq('league_team_id', team.id)
                    .neq('enrollment_status', 'withdrawn');
                // Get invites
                const { data: invites } = yield database_1.supabase
                    .from('league_team_invites')
                    .select('*')
                    .eq('league_team_id', team.id)
                    .order('invited_at');
                enrichedTeams.push(Object.assign(Object.assign({}, team), { captain_name: (captain === null || captain === void 0 ? void 0 : captain.full_name) || 'Unknown', members: (members || []).map(m => ({
                        league_player_id: m.id,
                        user_id: m.user_id,
                        display_name: m.display_name,
                        enrollment_status: m.enrollment_status,
                        season_paid: m.season_paid,
                        prize_pot_paid: m.prize_pot_paid,
                        is_captain: m.user_id === team.captain_user_id,
                    })), invites: invites || [] }));
            }
            return enrichedTeams;
        });
    }
    getTeam(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: team, error } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('id', teamId)
                .single();
            if (error || !team) {
                throw new Error(`Team not found: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            const { data: captain } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name')
                .eq('id', team.captain_user_id)
                .single();
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, user_id, display_name, enrollment_status, season_paid, prize_pot_paid')
                .eq('league_team_id', team.id)
                .neq('enrollment_status', 'withdrawn');
            const { data: invites } = yield database_1.supabase
                .from('league_team_invites')
                .select('*')
                .eq('league_team_id', team.id)
                .order('invited_at');
            return Object.assign(Object.assign({}, team), { captain_name: (captain === null || captain === void 0 ? void 0 : captain.full_name) || 'Unknown', members: (members || []).map(m => ({
                    league_player_id: m.id,
                    user_id: m.user_id,
                    display_name: m.display_name,
                    enrollment_status: m.enrollment_status,
                    season_paid: m.season_paid,
                    prize_pot_paid: m.prize_pot_paid,
                    is_captain: m.user_id === team.captain_user_id,
                })), invites: invites || [] });
        });
    }
    enrollTeamPlayer(leagueId_1, teamId_1, userId_1, displayName_1) {
        return __awaiter(this, arguments, void 0, function* (leagueId, teamId, userId, displayName, initialHandicap = 0) {
            const league = yield this.getLeague(leagueId);
            if (league.format !== 'team') {
                throw new Error('This league does not support teams');
            }
            // Verify team exists and is in valid state
            const { data: team } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('id', teamId)
                .single();
            if (!team) {
                throw new Error('Team not found');
            }
            if (team.status !== 'pending_payment' && team.status !== 'forming') {
                throw new Error(`Team is in '${team.status}' status and cannot accept payments`);
            }
            // Get the player's existing record (should already exist from invite accept or team creation)
            const { data: existingPlayer } = yield database_1.supabase
                .from('league_players')
                .select('*')
                .eq('league_id', leagueId)
                .eq('user_id', userId)
                .eq('league_team_id', teamId)
                .single();
            if (!existingPlayer) {
                throw new Error('You must accept the team invite before paying');
            }
            if (existingPlayer.enrollment_status === 'active' && existingPlayer.season_paid) {
                throw new Error('You have already paid for this league');
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
                    .update({ enrollment_status: 'active', season_paid: true, prize_pot_paid: true, current_handicap: initialHandicap })
                    .eq('id', existingPlayer.id);
                yield database_1.supabase
                    .from('league_standings')
                    .upsert({ league_id: leagueId, league_player_id: existingPlayer.id }, { onConflict: 'league_id,league_player_id' });
                // Check if all team members have paid
                yield this.checkTeamAllPaid(teamId);
                return { clientSecret: '', playerId: existingPlayer.id };
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
                    league_player_id: existingPlayer.id,
                    league_team_id: teamId,
                    season_fee: String(league.season_fee),
                    prize_pot_per_week: String(buyIn),
                    prize_pot_total: String(totalPrizePot),
                },
            }, stripeOpts);
            // Store payment intent ID and initial handicap on the player record
            yield database_1.supabase
                .from('league_players')
                .update({ stripe_payment_intent_id: paymentIntent.id, current_handicap: initialHandicap })
                .eq('id', existingPlayer.id);
            return {
                clientSecret: paymentIntent.client_secret,
                playerId: existingPlayer.id,
            };
        });
    }
    checkTeamAllPaid(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: team } = yield database_1.supabase
                .from('league_teams')
                .select('*, leagues(players_per_team)')
                .eq('id', teamId)
                .single();
            if (!team)
                return false;
            const playersPerTeam = ((_a = team.leagues) === null || _a === void 0 ? void 0 : _a.players_per_team) || team.players_per_team;
            // Get all team members
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, enrollment_status, season_paid')
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            if (!members || members.length < playersPerTeam)
                return false;
            const allPaid = members.every(m => m.enrollment_status === 'active' && m.season_paid);
            if (allPaid && (team.status === 'pending_payment' || team.status === 'forming')) {
                yield database_1.supabase
                    .from('league_teams')
                    .update({ status: 'active' })
                    .eq('id', teamId);
                // Create standings rows for team members who don't have one
                for (const member of members) {
                    yield database_1.supabase
                        .from('league_standings')
                        .upsert({
                        league_id: team.league_id,
                        league_player_id: member.id,
                        league_team_id: teamId,
                    }, { onConflict: 'league_id,league_player_id' });
                }
                return true;
            }
            return false;
        });
    }
    disqualifyTeam(teamId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: team, error: teamError } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('id', teamId)
                .single();
            if (teamError || !team) {
                throw new Error('Team not found');
            }
            const dqLeague = yield this.getLeague(team.league_id);
            const dqStripeOpts = yield (0, stripe_1.getStripeOptions)(dqLeague.location_id);
            // Mark team as disqualified
            yield database_1.supabase
                .from('league_teams')
                .update({ status: 'disqualified' })
                .eq('id', teamId);
            // Get all team members
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, user_id, display_name, enrollment_status, season_paid, stripe_payment_intent_id')
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            const refundedPlayers = [];
            for (const member of (members || [])) {
                // Refund paid members
                if (member.season_paid && member.stripe_payment_intent_id) {
                    try {
                        yield stripe_1.stripe.refunds.create({
                            payment_intent: member.stripe_payment_intent_id,
                            metadata: {
                                league_id: team.league_id,
                                league_player_id: member.id,
                                league_team_id: teamId,
                                reason: `Team disqualified: ${reason}`,
                            },
                        }, dqStripeOpts);
                        refundedPlayers.push(member.display_name);
                    }
                    catch (refundError) {
                        logger_1.logger.error({ err: refundError, playerId: member.id }, 'Failed to refund player');
                    }
                }
                // Mark all team members as withdrawn
                yield database_1.supabase
                    .from('league_players')
                    .update({ enrollment_status: 'withdrawn' })
                    .eq('id', member.id);
                // Cancel any pending prize ledger entries for this player
                yield database_1.supabase
                    .from('league_prize_ledger')
                    .update({ payout_status: 'cancelled' })
                    .eq('league_player_id', member.id)
                    .eq('league_id', team.league_id)
                    .eq('payout_status', 'pending');
            }
            // Expire any pending invites
            yield database_1.supabase
                .from('league_team_invites')
                .update({ status: 'expired', responded_at: new Date().toISOString() })
                .eq('league_team_id', teamId)
                .eq('status', 'pending');
            return { refundedPlayers };
        });
    }
    processTeamDeadlines() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const disqualified = [];
            // Find all team leagues that are active or in registration
            const { data: teamLeagues } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('format', 'team')
                .in('status', ['registration', 'active']);
            if (!teamLeagues || teamLeagues.length === 0)
                return { disqualified };
            for (const league of teamLeagues) {
                // Get the first week date/time as the deadline
                const { data: firstWeek } = yield database_1.supabase
                    .from('league_weeks')
                    .select('date')
                    .eq('league_id', league.id)
                    .order('week_number', { ascending: true })
                    .limit(1)
                    .single();
                if (!firstWeek)
                    continue;
                // Build deadline: first week date + league start_time
                const deadline = new Date(`${firstWeek.date}T${league.start_time}:00Z`);
                if (now < deadline)
                    continue; // Deadline hasn't passed yet
                // Find teams that are NOT 'active' and not already 'disqualified'/'withdrawn'
                const { data: teams } = yield database_1.supabase
                    .from('league_teams')
                    .select('*')
                    .eq('league_id', league.id)
                    .in('status', ['forming', 'pending_payment']);
                for (const team of (teams || [])) {
                    // Check if all members have paid
                    const { data: members } = yield database_1.supabase
                        .from('league_players')
                        .select('enrollment_status, season_paid')
                        .eq('league_team_id', team.id)
                        .neq('enrollment_status', 'withdrawn');
                    const allPaid = (members || []).length >= league.players_per_team &&
                        (members || []).every(m => m.enrollment_status === 'active' && m.season_paid);
                    if (!allPaid) {
                        try {
                            yield this.disqualifyTeam(team.id, 'Payment deadline passed');
                            disqualified.push(`${team.team_name} (league: ${league.name})`);
                        }
                        catch (err) {
                            logger_1.logger.error({ err, teamId: team.id }, 'Failed to disqualify team');
                        }
                    }
                }
            }
            return { disqualified };
        });
    }
    getUserTeams(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Get all league_players for this user that are on teams
            const { data: players, error } = yield database_1.supabase
                .from('league_players')
                .select('*, league_teams(*, leagues(name, format, status, total_weeks, season_fee, weekly_prize_pot, prize_pool_config, start_time, num_holes, players_per_team, team_scoring_format))')
                .eq('user_id', userId)
                .neq('enrollment_status', 'withdrawn')
                .not('league_team_id', 'is', null);
            if (error) {
                throw new Error(`Failed to fetch user teams: ${error.message}`);
            }
            const results = [];
            for (const player of (players || [])) {
                const team = player.league_teams;
                const league = team === null || team === void 0 ? void 0 : team.leagues;
                if (!team || !league)
                    continue;
                // Get team members
                const { data: members } = yield database_1.supabase
                    .from('league_players')
                    .select('id, user_id, display_name, enrollment_status, season_paid')
                    .eq('league_team_id', team.id)
                    .neq('enrollment_status', 'withdrawn');
                // Get invites
                const { data: invites } = yield database_1.supabase
                    .from('league_team_invites')
                    .select('id, invited_email, status')
                    .eq('league_team_id', team.id);
                results.push({
                    teamId: team.id,
                    teamName: team.team_name,
                    teamStatus: team.status,
                    isCaptain: team.captain_user_id === userId,
                    playerId: player.id,
                    enrollmentStatus: player.enrollment_status,
                    seasonPaid: player.season_paid,
                    league: {
                        id: team.league_id,
                        name: league.name,
                        format: league.format,
                        status: league.status,
                        totalWeeks: league.total_weeks,
                        seasonFee: league.season_fee,
                        weeklyPrizePot: (((_a = league.prize_pool_config) === null || _a === void 0 ? void 0 : _a.enabled) ? league.prize_pool_config.buyInPerSession : 0),
                        numHoles: league.num_holes,
                        playersPerTeam: league.players_per_team,
                        teamScoringFormat: league.team_scoring_format,
                    },
                    members: (members || []).map(m => ({
                        playerId: m.id,
                        userId: m.user_id,
                        displayName: m.display_name,
                        enrollmentStatus: m.enrollment_status,
                        seasonPaid: m.season_paid,
                        isCaptain: m.user_id === team.captain_user_id,
                    })),
                    pendingInvites: (invites || []).filter(i => i.status === 'pending'),
                });
            }
            return results;
        });
    }
    calculateTeamScore(teamId, weekId, league) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, team_scoring_utils_1.calculateTeamScore)(teamId, weekId, league);
        });
    }
}
exports.LeagueTeamService = LeagueTeamService;
