import { supabase } from '../../config/database';
import { stripe, getStripeOptions, getOrCreateCustomerForLocation } from '../../config/stripe';
import { logger } from '../../shared/utils/logger';
import { EmailService } from '../email/email.service';
import { calculateTeamScore } from './team-scoring.utils';
import {
  League,
  LeagueTeam,
  LeagueTeamInvite,
  LeagueTeamMember,
  PrizePoolConfig,
} from './league.types';

export class LeagueTeamService {

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

  async createTeam(leagueId: string, captainUserId: string, teamName: string): Promise<LeagueTeam> {
    const league = await this.getLeague(leagueId);

    if (league.format !== 'team') {
      throw new Error('This league does not support teams');
    }

    if (league.status !== 'registration' && league.status !== 'active') {
      throw new Error('League is not accepting teams');
    }

    // Check if captain is already on a team in this league
    const { data: existingPlayer } = await supabase
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
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', captainUserId)
      .single();

    if (!userProfile) {
      throw new Error('User not found');
    }

    // Create the team
    const { data: team, error } = await supabase
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
      if (error?.code === '23505') {
        throw new Error('A team with that name already exists in this league');
      }
      throw new Error(`Failed to create team: ${error?.message}`);
    }

    // Create league_player record for the captain, linked to the team
    if (existingPlayer) {
      // Update existing player record to link to team
      await supabase
        .from('league_players')
        .update({ league_team_id: team.id })
        .eq('id', existingPlayer.id);
    } else {
      const { error: playerError } = await supabase
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
        logger.error({ err: playerError }, 'Failed to create captain player record');
      }
    }

    return team;
  }

  async inviteTeammates(
    teamId: string,
    captainUserId: string,
    emails: string[]
  ): Promise<{ invited: LeagueTeamInvite[]; errors: { email: string; reason: string }[] }> {
    // Verify team exists and user is captain
    const { data: team, error: teamError } = await supabase
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

    const league = team.leagues as any;

    // Check how many slots remain
    const { count: existingInvites } = await supabase
      .from('league_team_invites')
      .select('id', { count: 'exact', head: true })
      .eq('league_team_id', teamId)
      .in('status', ['pending', 'accepted']);

    const { count: existingMembers } = await supabase
      .from('league_players')
      .select('id', { count: 'exact', head: true })
      .eq('league_team_id', teamId)
      .neq('enrollment_status', 'withdrawn');

    const totalSlotsTaken = (existingMembers || 0);
    const maxNeeded = league.players_per_team - totalSlotsTaken;

    if (emails.length > maxNeeded) {
      throw new Error(`Team only has ${maxNeeded} open slot(s). You tried to invite ${emails.length} player(s).`);
    }

    const invited: LeagueTeamInvite[] = [];
    const errors: { email: string; reason: string }[] = [];

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim();

      // Find user by email
      const { data: user } = await supabase
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
      const { data: existingInvite } = await supabase
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
      const { data: otherTeamPlayer } = await supabase
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
      const { data: invite, error: inviteError } = await supabase
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
        errors.push({ email: normalizedEmail, reason: `Failed to create invite: ${inviteError?.message}` });
        continue;
      }

      invited.push(invite);

      // Send invite email (fire-and-forget)
      const frontendUrl = process.env.FRONTEND_URL || 'https://app.golflabs.us';
      const captainProfile = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', captainUserId)
        .single();

      EmailService.sendTeamInviteEmail(league.location_id, {
        invitedUserName: user.full_name || user.email,
        invitedEmail: normalizedEmail,
        captainName: captainProfile.data?.full_name || 'Your teammate',
        teamName: team.team_name,
        leagueName: league.name,
        seasonFee: league.season_fee || 0,
        weeklyPrizePot: ((league.prize_pool_config as PrizePoolConfig | null)?.enabled ? (league.prize_pool_config as PrizePoolConfig).buyInPerSession : 0),
        totalWeeks: league.total_weeks || 0,
        numHoles: league.num_holes || 9,
        playersPerTeam: league.players_per_team,
        acceptUrl: `${frontendUrl}/team-invite/${invite.invite_token}`,
        declineUrl: `${frontendUrl}/team-invite/${invite.invite_token}?action=decline`,
      }).catch(err => logger.error({ err }, 'Failed to send team invite email'));
    }

    return { invited, errors };
  }

  async acceptInvite(inviteToken: string, userId: string): Promise<{ team: LeagueTeam; invite: LeagueTeamInvite }> {
    // Find the invite by token
    const { data: invite, error: inviteError } = await supabase
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

    const team = invite.league_teams as any;
    const league = team?.leagues as any;

    if (!team || !league) {
      throw new Error('Team or league not found');
    }

    // Accept the invite
    const { data: updatedInvite, error: updateError } = await supabase
      .from('league_team_invites')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invite.id)
      .select()
      .single();

    if (updateError || !updatedInvite) {
      throw new Error(`Failed to accept invite: ${updateError?.message}`);
    }

    // Get user profile for display name
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Create league_player record (pending - payment not yet done)
    const { error: playerError } = await supabase
      .from('league_players')
      .upsert({
        league_id: team.league_id,
        user_id: userId,
        display_name: userProfile?.full_name || userProfile?.email || 'Unknown',
        enrollment_status: 'pending',
        season_paid: false,
        prize_pot_paid: false,
        league_team_id: team.id,
      }, { onConflict: 'league_id,user_id' });

    if (playerError) {
      logger.error({ err: playerError }, 'Failed to create player record on invite accept');
    }

    // Check if all invites are now accepted
    await this.checkAndTransitionTeamStatus(team.id);

    return { team, invite: updatedInvite };
  }

  async declineInvite(inviteToken: string, userId: string): Promise<void> {
    const { data: invite, error: inviteError } = await supabase
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

    await supabase
      .from('league_team_invites')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invite.id);
  }

  async getInviteByToken(token: string): Promise<any> {
    const { data, error } = await supabase
      .from('league_team_invites')
      .select('*, league_teams(team_name, captain_user_id, status, league_id, leagues(name, season_fee, weekly_prize_pot, prize_pool_config, total_weeks, start_time, num_holes, format, players_per_team, team_scoring_format))')
      .eq('invite_token', token)
      .single();

    if (error || !data) {
      throw new Error('Invite not found');
    }

    const team = data.league_teams as any;
    const league = team?.leagues as any;

    // Get captain name
    const { data: captain } = await supabase
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
      captainName: captain?.full_name || 'Unknown',
      league: league ? {
        id: league.id || team.league_id,
        name: league.name,
        seasonFee: league.season_fee,
        weeklyPrizePot: ((league.prize_pool_config as PrizePoolConfig | null)?.enabled ? (league.prize_pool_config as PrizePoolConfig).buyInPerSession : 0),
        totalWeeks: league.total_weeks,
        startTime: league.start_time,
        numHoles: league.num_holes,
        format: league.format,
        playersPerTeam: league.players_per_team,
        teamScoringFormat: league.team_scoring_format,
      } : null,
    };
  }

  async checkAndTransitionTeamStatus(teamId: string): Promise<void> {
    const { data: team } = await supabase
      .from('league_teams')
      .select('*, leagues(players_per_team)')
      .eq('id', teamId)
      .single();

    if (!team) return;

    const playersPerTeam = (team.leagues as any)?.players_per_team || team.players_per_team;

    // Count current members (league_players linked to this team, not withdrawn)
    const { count: memberCount } = await supabase
      .from('league_players')
      .select('id', { count: 'exact', head: true })
      .eq('league_team_id', teamId)
      .neq('enrollment_status', 'withdrawn');

    // If team is full, move to pending_payment
    if ((memberCount || 0) >= playersPerTeam && team.status === 'forming') {
      await supabase
        .from('league_teams')
        .update({ status: 'pending_payment' })
        .eq('id', teamId);
    }
  }

  async getTeams(leagueId: string): Promise<LeagueTeam[]> {
    const { data: teams, error } = await supabase
      .from('league_teams')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch teams: ${error.message}`);
    }

    // Enrich with members and invites
    const enrichedTeams: LeagueTeam[] = [];

    for (const team of (teams || [])) {
      // Get captain name
      const { data: captain } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', team.captain_user_id)
        .single();

      // Get team members
      const { data: members } = await supabase
        .from('league_players')
        .select('id, user_id, display_name, enrollment_status, season_paid, prize_pot_paid')
        .eq('league_team_id', team.id)
        .neq('enrollment_status', 'withdrawn');

      // Get invites
      const { data: invites } = await supabase
        .from('league_team_invites')
        .select('*')
        .eq('league_team_id', team.id)
        .order('invited_at');

      enrichedTeams.push({
        ...team,
        captain_name: captain?.full_name || 'Unknown',
        members: (members || []).map(m => ({
          league_player_id: m.id,
          user_id: m.user_id,
          display_name: m.display_name,
          enrollment_status: m.enrollment_status,
          season_paid: m.season_paid,
          prize_pot_paid: m.prize_pot_paid,
          is_captain: m.user_id === team.captain_user_id,
        })),
        invites: invites || [],
      });
    }

    return enrichedTeams;
  }

  async getTeam(teamId: string): Promise<LeagueTeam> {
    const { data: team, error } = await supabase
      .from('league_teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error || !team) {
      throw new Error(`Team not found: ${error?.message}`);
    }

    const { data: captain } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', team.captain_user_id)
      .single();

    const { data: members } = await supabase
      .from('league_players')
      .select('id, user_id, display_name, enrollment_status, season_paid, prize_pot_paid')
      .eq('league_team_id', team.id)
      .neq('enrollment_status', 'withdrawn');

    const { data: invites } = await supabase
      .from('league_team_invites')
      .select('*')
      .eq('league_team_id', team.id)
      .order('invited_at');

    return {
      ...team,
      captain_name: captain?.full_name || 'Unknown',
      members: (members || []).map(m => ({
        league_player_id: m.id,
        user_id: m.user_id,
        display_name: m.display_name,
        enrollment_status: m.enrollment_status,
        season_paid: m.season_paid,
        prize_pot_paid: m.prize_pot_paid,
        is_captain: m.user_id === team.captain_user_id,
      })),
      invites: invites || [],
    };
  }

  async enrollTeamPlayer(
    leagueId: string,
    teamId: string,
    userId: string,
    displayName: string,
    initialHandicap: number = 0
  ): Promise<{ clientSecret: string; playerId: string }> {
    const league = await this.getLeague(leagueId);

    if (league.format !== 'team') {
      throw new Error('This league does not support teams');
    }

    // Verify team exists and is in valid state
    const { data: team } = await supabase
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
    const { data: existingPlayer } = await supabase
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
    const prizeConfig = league.prize_pool_config as PrizePoolConfig | null;
    const buyIn = prizeConfig?.enabled ? prizeConfig.buyInPerSession : 0;
    const totalPrizePot = buyIn * league.total_weeks;
    const totalAmount = (league.season_fee + totalPrizePot) * 100; // cents

    if (totalAmount === 0) {
      // Free league — activate immediately
      await supabase
        .from('league_players')
        .update({ enrollment_status: 'active', season_paid: true, prize_pot_paid: true, current_handicap: initialHandicap })
        .eq('id', existingPlayer.id);

      await supabase
        .from('league_standings')
        .upsert({ league_id: leagueId, league_player_id: existingPlayer.id }, { onConflict: 'league_id,league_player_id' });

      // Check if all team members have paid
      await this.checkTeamAllPaid(teamId);

      return { clientSecret: '', playerId: existingPlayer.id };
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
        league_player_id: existingPlayer.id,
        league_team_id: teamId,
        season_fee: String(league.season_fee),
        prize_pot_per_week: String(buyIn),
        prize_pot_total: String(totalPrizePot),
      },
    }, stripeOpts);

    // Store payment intent ID and initial handicap on the player record
    await supabase
      .from('league_players')
      .update({ stripe_payment_intent_id: paymentIntent.id, current_handicap: initialHandicap })
      .eq('id', existingPlayer.id);

    return {
      clientSecret: paymentIntent.client_secret!,
      playerId: existingPlayer.id,
    };
  }

  async checkTeamAllPaid(teamId: string): Promise<boolean> {
    const { data: team } = await supabase
      .from('league_teams')
      .select('*, leagues(players_per_team)')
      .eq('id', teamId)
      .single();

    if (!team) return false;

    const playersPerTeam = (team.leagues as any)?.players_per_team || team.players_per_team;

    // Get all team members
    const { data: members } = await supabase
      .from('league_players')
      .select('id, enrollment_status, season_paid')
      .eq('league_team_id', teamId)
      .neq('enrollment_status', 'withdrawn');

    if (!members || members.length < playersPerTeam) return false;

    const allPaid = members.every(m => m.enrollment_status === 'active' && m.season_paid);

    if (allPaid && (team.status === 'pending_payment' || team.status === 'forming')) {
      await supabase
        .from('league_teams')
        .update({ status: 'active' })
        .eq('id', teamId);

      // Create standings rows for team members who don't have one
      for (const member of members) {
        await supabase
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
  }

  async disqualifyTeam(teamId: string, reason: string): Promise<{ refundedPlayers: string[] }> {
    const { data: team, error: teamError } = await supabase
      .from('league_teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      throw new Error('Team not found');
    }

    const dqLeague = await this.getLeague(team.league_id);
    const dqStripeOpts = await getStripeOptions(dqLeague.location_id);

    // Mark team as disqualified
    await supabase
      .from('league_teams')
      .update({ status: 'disqualified' })
      .eq('id', teamId);

    // Get all team members
    const { data: members } = await supabase
      .from('league_players')
      .select('id, user_id, display_name, enrollment_status, season_paid, stripe_payment_intent_id')
      .eq('league_team_id', teamId)
      .neq('enrollment_status', 'withdrawn');

    const refundedPlayers: string[] = [];

    for (const member of (members || [])) {
      // Refund paid members
      if (member.season_paid && member.stripe_payment_intent_id) {
        try {
          await stripe.refunds.create({
            payment_intent: member.stripe_payment_intent_id,
            metadata: {
              league_id: team.league_id,
              league_player_id: member.id,
              league_team_id: teamId,
              reason: `Team disqualified: ${reason}`,
            },
          }, dqStripeOpts);
          refundedPlayers.push(member.display_name);
        } catch (refundError: any) {
          logger.error({ err: refundError, playerId: member.id }, 'Failed to refund player');
        }
      }

      // Mark all team members as withdrawn
      await supabase
        .from('league_players')
        .update({ enrollment_status: 'withdrawn' })
        .eq('id', member.id);

      // Cancel any pending prize ledger entries for this player
      await supabase
        .from('league_prize_ledger')
        .update({ payout_status: 'cancelled' })
        .eq('league_player_id', member.id)
        .eq('league_id', team.league_id)
        .eq('payout_status', 'pending');
    }

    // Expire any pending invites
    await supabase
      .from('league_team_invites')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('league_team_id', teamId)
      .eq('status', 'pending');

    return { refundedPlayers };
  }

  async processTeamDeadlines(): Promise<{ disqualified: string[] }> {
    const now = new Date();
    const disqualified: string[] = [];

    // Find all team leagues that are active or in registration
    const { data: teamLeagues } = await supabase
      .from('leagues')
      .select('*')
      .eq('format', 'team')
      .in('status', ['registration', 'active']);

    if (!teamLeagues || teamLeagues.length === 0) return { disqualified };

    for (const league of teamLeagues) {
      // Get the first week date/time as the deadline
      const { data: firstWeek } = await supabase
        .from('league_weeks')
        .select('date')
        .eq('league_id', league.id)
        .order('week_number', { ascending: true })
        .limit(1)
        .single();

      if (!firstWeek) continue;

      // Build deadline: first week date + league start_time
      const deadline = new Date(`${firstWeek.date}T${league.start_time}:00Z`);
      if (now < deadline) continue; // Deadline hasn't passed yet

      // Find teams that are NOT 'active' and not already 'disqualified'/'withdrawn'
      const { data: teams } = await supabase
        .from('league_teams')
        .select('*')
        .eq('league_id', league.id)
        .in('status', ['forming', 'pending_payment']);

      for (const team of (teams || [])) {
        // Check if all members have paid
        const { data: members } = await supabase
          .from('league_players')
          .select('enrollment_status, season_paid')
          .eq('league_team_id', team.id)
          .neq('enrollment_status', 'withdrawn');

        const allPaid = (members || []).length >= league.players_per_team &&
          (members || []).every(m => m.enrollment_status === 'active' && m.season_paid);

        if (!allPaid) {
          try {
            await this.disqualifyTeam(team.id, 'Payment deadline passed');
            disqualified.push(`${team.team_name} (league: ${league.name})`);
          } catch (err: any) {
            logger.error({ err, teamId: team.id }, 'Failed to disqualify team');
          }
        }
      }
    }

    return { disqualified };
  }

  async getUserTeams(userId: string): Promise<any[]> {
    // Get all league_players for this user that are on teams
    const { data: players, error } = await supabase
      .from('league_players')
      .select('*, league_teams(*, leagues(name, format, status, deleted_at, total_weeks, season_fee, weekly_prize_pot, prize_pool_config, start_time, num_holes, players_per_team, team_scoring_format))')
      .eq('user_id', userId)
      .neq('enrollment_status', 'withdrawn')
      .not('league_team_id', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch user teams: ${error.message}`);
    }

    const results: any[] = [];

    for (const player of (players || [])) {
      const team = player.league_teams as any;
      const league = team?.leagues as any;
      if (!team || !league) continue;

      // Skip teams from deleted/cancelled leagues
      if (league.deleted_at || league.status === 'cancelled') continue;

      // Get team members
      const { data: members } = await supabase
        .from('league_players')
        .select('id, user_id, display_name, enrollment_status, season_paid')
        .eq('league_team_id', team.id)
        .neq('enrollment_status', 'withdrawn');

      // Get invites
      const { data: invites } = await supabase
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
          weeklyPrizePot: ((league.prize_pool_config as PrizePoolConfig | null)?.enabled ? (league.prize_pool_config as PrizePoolConfig).buyInPerSession : 0),
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
  }

  async calculateTeamScore(
    teamId: string,
    weekId: string,
    league: League
  ): Promise<{ teamGross: number; teamNet: number; memberScores: any[] }> {
    return calculateTeamScore(teamId, weekId, league);
  }
}
