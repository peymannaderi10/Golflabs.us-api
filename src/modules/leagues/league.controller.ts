import { Request, Response } from 'express';
import { LeagueService } from './league.service';
import { SocketService } from '../sockets/socket.service';
import { LeagueScorePayload } from './league.types';

export class LeagueController {
  private leagueService: LeagueService;
  private socketService: SocketService;

  constructor(socketService: SocketService) {
    this.leagueService = new LeagueService();
    this.socketService = socketService;
  }

  // =====================================================
  // LEAGUE CRUD
  // =====================================================

  createLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.createLeague(req.body);
      res.status(201).json(league);
    } catch (error: any) {
      console.error('Error creating league:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getLeaguesByLocation = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }
      const leagues = await this.leagueService.getLeaguesByLocation(locationId as string);
      res.json(leagues);
    } catch (error: any) {
      console.error('Error fetching leagues:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.getLeague(req.params.leagueId);
      res.json(league);
    } catch (error: any) {
      console.error('Error fetching league:', error);
      res.status(404).json({ error: error.message });
    }
  };

  updateLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.updateLeague(req.params.leagueId, req.body);
      res.json(league);
    } catch (error: any) {
      console.error('Error updating league:', error);
      res.status(500).json({ error: error.message });
    }
  };

  activateLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.activateLeague(req.params.leagueId);
      res.json(league);
    } catch (error: any) {
      console.error('Error activating league:', error);
      res.status(400).json({ error: error.message });
    }
  };

  // =====================================================
  // COURSE MANAGEMENT
  // =====================================================

  addCourse = async (req: Request, res: Response) => {
    try {
      const course = await this.leagueService.addCourse(req.params.leagueId, req.body);
      res.status(201).json(course);
    } catch (error: any) {
      console.error('Error adding course:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getCourses = async (req: Request, res: Response) => {
    try {
      const courses = await this.leagueService.getCourses(req.params.leagueId);
      res.json(courses);
    } catch (error: any) {
      console.error('Error fetching courses:', error);
      res.status(500).json({ error: error.message });
    }
  };

  updateCourse = async (req: Request, res: Response) => {
    try {
      const course = await this.leagueService.updateCourse(req.params.courseId, req.body);
      res.json(course);
    } catch (error: any) {
      console.error('Error updating course:', error);
      res.status(500).json({ error: error.message });
    }
  };

  deleteCourse = async (req: Request, res: Response) => {
    try {
      await this.leagueService.deleteCourse(req.params.courseId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting course:', error);
      res.status(500).json({ error: error.message });
    }
  };

  assignCourseToWeek = async (req: Request, res: Response) => {
    try {
      const { courseId } = req.body;
      if (!courseId) {
        return res.status(400).json({ error: 'courseId is required' });
      }
      const week = await this.leagueService.assignCourseToWeek(req.params.weekId, courseId);
      res.json(week);
    } catch (error: any) {
      console.error('Error assigning course to week:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // PLAYER ENROLLMENT
  // =====================================================

  enrollPlayer = async (req: Request, res: Response) => {
    try {
      const player = await this.leagueService.enrollPlayer(req.params.leagueId, req.body);
      res.status(201).json(player);
    } catch (error: any) {
      console.error('Error enrolling player:', error);
      if (error.message.includes('already enrolled')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('full')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  getPlayers = async (req: Request, res: Response) => {
    try {
      const players = await this.leagueService.getPlayers(req.params.leagueId);
      res.json(players);
    } catch (error: any) {
      console.error('Error fetching players:', error);
      res.status(500).json({ error: error.message });
    }
  };

  withdrawPlayer = async (req: Request, res: Response) => {
    try {
      await this.leagueService.withdrawPlayer(req.params.leagueId, req.params.playerId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error withdrawing player:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // COMMISSIONER POWERS — HANDICAP OVERRIDE
  // =====================================================

  overrideHandicap = async (req: Request, res: Response) => {
    try {
      const { handicap, reason } = req.body;
      if (handicap === undefined || !reason) {
        return res.status(400).json({ error: 'handicap and reason are required' });
      }

      // Use the authenticated employee's ID as overrider
      const overriddenBy = (req as any).employee?.id || 'unknown';

      await this.leagueService.overrideHandicap(
        req.params.leagueId,
        req.params.playerId,
        handicap,
        overriddenBy,
        reason
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error overriding handicap:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // WEEKLY SESSIONS
  // =====================================================

  getWeeks = async (req: Request, res: Response) => {
    try {
      const weeks = await this.leagueService.getWeeks(req.params.leagueId);
      res.json(weeks);
    } catch (error: any) {
      console.error('Error fetching weeks:', error);
      res.status(500).json({ error: error.message });
    }
  };

  activateWeek = async (req: Request, res: Response) => {
    try {
      const week = await this.leagueService.activateWeek(req.params.leagueId, req.params.weekId);
      res.json(week);
    } catch (error: any) {
      console.error('Error activating week:', error);
      res.status(500).json({ error: error.message });
    }
  };

  finalizeWeek = async (req: Request, res: Response) => {
    try {
      const result = await this.leagueService.finalizeWeek(req.params.leagueId, req.params.weekId);

      // Broadcast updated standings via Socket.io
      const league = await this.leagueService.getLeague(req.params.leagueId);
      this.socketService.emitStandingsUpdate(league.location_id, league.id, {
        type: 'league_standings_update',
        leagueId: league.id,
        standings: result.standings,
        timestamp: new Date().toISOString(),
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error finalizing week:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // SCORE ENTRY
  // =====================================================

  submitScore = async (req: Request, res: Response) => {
    try {
      const result = await this.leagueService.submitScore(req.body);

      // Get player info for the broadcast payload
      const league = await this.leagueService.getLeague(req.params.leagueId);
      const players = await this.leagueService.getPlayers(req.params.leagueId);
      const player = players.find(p => p.id === req.body.leaguePlayerId);

      // Broadcast score update via Socket.io
      if (player) {
        const payload: LeagueScorePayload = {
          type: 'league_score_update',
          leagueId: league.id,
          weekId: req.body.leagueWeekId,
          player: {
            id: player.id,
            displayName: player.display_name,
            handicap: player.current_handicap,
          },
          holeNumber: req.body.holeNumber,
          strokes: req.body.strokes,
          roundGross: result.round_gross,
          holesCompleted: result.holes_entered,
          totalHoles: result.total_holes,
          timestamp: new Date().toISOString(),
        };

        this.socketService.emitScoreUpdate(league.location_id, league.id, payload);
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error submitting score:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getWeekScores = async (req: Request, res: Response) => {
    try {
      const scores = await this.leagueService.getWeekScores(req.params.leagueId, req.params.weekId);
      res.json(scores);
    } catch (error: any) {
      console.error('Error fetching week scores:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getPlayerScorecard = async (req: Request, res: Response) => {
    try {
      const scorecard = await this.leagueService.getPlayerScorecard(
        req.params.leagueId,
        req.params.weekId,
        req.params.playerId
      );
      res.json(scorecard);
    } catch (error: any) {
      console.error('Error fetching player scorecard:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // SCORE AUDITABILITY — CONFIRM / OVERRIDE
  // =====================================================

  confirmScore = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as any).employee?.id || 'unknown';
      await this.leagueService.confirmScore(req.params.scoreId, confirmedBy);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error confirming score:', error);
      res.status(500).json({ error: error.message });
    }
  };

  confirmWeekScores = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as any).employee?.id || 'unknown';
      const count = await this.leagueService.confirmWeekScores(req.params.weekId, confirmedBy);
      res.json({ success: true, confirmed: count });
    } catch (error: any) {
      console.error('Error confirming week scores:', error);
      res.status(500).json({ error: error.message });
    }
  };

  overrideScore = async (req: Request, res: Response) => {
    try {
      const { strokes, reason } = req.body;
      if (strokes === undefined || !reason) {
        return res.status(400).json({ error: 'strokes and reason are required' });
      }

      const overriddenBy = (req as any).employee?.id || 'unknown';
      await this.leagueService.overrideScore(req.params.scoreId, strokes, overriddenBy, reason);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error overriding score:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // STANDINGS & LEADERBOARD
  // =====================================================

  getStandings = async (req: Request, res: Response) => {
    try {
      const standings = await this.leagueService.getStandings(req.params.leagueId);
      res.json(standings);
    } catch (error: any) {
      console.error('Error fetching standings:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getLiveLeaderboard = async (req: Request, res: Response) => {
    try {
      const leaderboard = await this.leagueService.getLiveLeaderboard(req.params.leagueId);
      res.json(leaderboard);
    } catch (error: any) {
      console.error('Error fetching live leaderboard:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getTeamLeaderboard = async (req: Request, res: Response) => {
    try {
      const leaderboard = await this.leagueService.getTeamLeaderboard(req.params.leagueId);
      res.json(leaderboard);
    } catch (error: any) {
      console.error('Error fetching team leaderboard:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // PAYMENT
  // =====================================================

  enrollAndPay = async (req: Request, res: Response) => {
    try {
      const { userId, displayName } = req.body;
      if (!userId || !displayName) {
        return res.status(400).json({ error: 'userId and displayName are required' });
      }

      const result = await this.leagueService.enrollAndPay(
        req.params.leagueId,
        userId,
        displayName
      );

      res.json(result);
    } catch (error: any) {
      console.error('Error in enroll-and-pay:', error);
      if (error.message.includes('already enrolled') || error.message.includes('full')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('not accepting')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // USER-FACING: My Leagues
  // =====================================================

  getUserLeagues = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const leagues = await this.leagueService.getLeaguesForUser(userId);
      res.json(leagues);
    } catch (error: any) {
      console.error('Error fetching user leagues:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // KIOSK STATE
  // =====================================================

  getLeagueStateForKiosk = async (req: Request, res: Response) => {
    try {
      const { leagueId } = req.params;
      const { playerId, userId } = req.query;

      if (!playerId && !userId) {
        return res.status(400).json({ error: 'Either playerId or userId query parameter is required' });
      }

      const state = await this.leagueService.getLeagueStateForKiosk(leagueId, {
        playerId: playerId as string | undefined,
        userId: userId as string | undefined,
      });
      res.json(state);
    } catch (error: any) {
      console.error('Error fetching league state for kiosk:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // PRIZE POOL LEDGER
  // =====================================================

  getPrizePoolSummary = async (req: Request, res: Response) => {
    try {
      const summary = await this.leagueService.getPrizePoolSummary(req.params.leagueId);
      res.json(summary);
    } catch (error: any) {
      console.error('Error fetching prize pool summary:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getPlayerPrizeHistory = async (req: Request, res: Response) => {
    try {
      const history = await this.leagueService.getPlayerPrizeHistory(
        req.params.leagueId,
        req.params.playerId
      );
      res.json(history);
    } catch (error: any) {
      console.error('Error fetching player prize history:', error);
      res.status(500).json({ error: error.message });
    }
  };

  confirmWeekPayouts = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as any).employee?.id || 'unknown';
      await this.leagueService.confirmWeekPayouts(
        req.params.leagueId,
        req.params.weekId,
        confirmedBy
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error confirming week payouts:', error);
      res.status(500).json({ error: error.message });
    }
  };

  confirmSinglePayout = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as any).employee?.id || 'unknown';
      await this.leagueService.confirmPayout(req.params.entryId, confirmedBy);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error confirming payout:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // =====================================================
  // TEAM MANAGEMENT
  // =====================================================

  createTeam = async (req: Request, res: Response) => {
    try {
      const { captainUserId, teamName } = req.body;
      if (!captainUserId || !teamName) {
        return res.status(400).json({ error: 'captainUserId and teamName are required' });
      }
      const team = await this.leagueService.createTeam(req.params.leagueId, captainUserId, teamName);
      res.status(201).json(team);
    } catch (error: any) {
      console.error('Error creating team:', error);
      if (error.message.includes('already on a team') || error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('does not support') || error.message.includes('not accepting')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  getTeams = async (req: Request, res: Response) => {
    try {
      const teams = await this.leagueService.getTeams(req.params.leagueId);
      res.json(teams);
    } catch (error: any) {
      console.error('Error fetching teams:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getTeam = async (req: Request, res: Response) => {
    try {
      const team = await this.leagueService.getTeam(req.params.teamId);
      res.json(team);
    } catch (error: any) {
      console.error('Error fetching team:', error);
      res.status(404).json({ error: error.message });
    }
  };

  inviteTeammates = async (req: Request, res: Response) => {
    try {
      const { emails, captainUserId } = req.body;
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: 'emails array is required' });
      }
      if (!captainUserId) {
        return res.status(400).json({ error: 'captainUserId is required' });
      }
      const result = await this.leagueService.inviteTeammates(req.params.teamId, captainUserId, emails);
      res.json(result);
    } catch (error: any) {
      console.error('Error inviting teammates:', error);
      if (error.message.includes('Only the team captain') || error.message.includes('no longer accepting')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  getInviteByToken = async (req: Request, res: Response) => {
    try {
      const invite = await this.leagueService.getInviteByToken(req.params.token);
      res.json(invite);
    } catch (error: any) {
      console.error('Error fetching invite:', error);
      res.status(404).json({ error: error.message });
    }
  };

  acceptInvite = async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const result = await this.leagueService.acceptInvite(req.params.token, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error accepting invite:', error);
      if (error.message.includes('not sent to you') || error.message.includes('already been')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  declineInvite = async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      await this.leagueService.declineInvite(req.params.token, userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error declining invite:', error);
      res.status(500).json({ error: error.message });
    }
  };

  enrollTeamPlayer = async (req: Request, res: Response) => {
    try {
      const { userId, displayName } = req.body;
      if (!userId || !displayName) {
        return res.status(400).json({ error: 'userId and displayName are required' });
      }
      const result = await this.leagueService.enrollTeamPlayer(
        req.params.leagueId,
        req.params.teamId,
        userId,
        displayName
      );
      res.json(result);
    } catch (error: any) {
      console.error('Error in team enroll-and-pay:', error);
      if (error.message.includes('already paid')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('does not support') || error.message.includes('cannot accept')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  disqualifyTeam = async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const result = await this.leagueService.disqualifyTeam(
        req.params.teamId,
        reason || 'Disqualified by employee'
      );
      res.json(result);
    } catch (error: any) {
      console.error('Error disqualifying team:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getUserTeams = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const teams = await this.leagueService.getUserTeams(userId);
      res.json(teams);
    } catch (error: any) {
      console.error('Error fetching user teams:', error);
      res.status(500).json({ error: error.message });
    }
  };
}
