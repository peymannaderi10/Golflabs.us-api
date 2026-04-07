import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { LeagueService } from './league.service';
import { AttendanceService } from './attendance.service';
import { CapacityHoldService } from '../bookings/capacity-hold.service';
import { SocketService } from '../sockets/socket.service';
import { LeagueScorePayload, ScheduleConfig, SubmitScoreRequest, SubmitScoreResult } from './league.types';
import { generateSessionDates } from './schedule-generator';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';

export class LeagueController {
  private leagueService: LeagueService;
  private attendanceService: AttendanceService;
  private capacityHoldService: CapacityHoldService;
  private socketService: SocketService;

  constructor(socketService: SocketService) {
    this.leagueService = new LeagueService();
    this.attendanceService = new AttendanceService();
    this.capacityHoldService = new CapacityHoldService();
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
      logger.error({ err: error }, 'Error creating league');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  previewSchedule = async (req: Request, res: Response) => {
    try {
      const config = req.body as ScheduleConfig;
      const sessions = generateSessionDates(config);
      res.json(sessions);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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
      logger.error({ err: error }, 'Error fetching leagues');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getCourseCatalog = async (_req: Request, res: Response) => {
    try {
      const courses = await this.leagueService.getCourseCatalog();
      res.json(courses);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching course catalog');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  searchPlayers = async (req: Request, res: Response) => {
    try {
      const players = await this.leagueService.searchPlayers(
        req.params.leagueId,
        req.query.q as string | undefined
      );
      res.json(players);
    } catch (error: any) {
      logger.error({ err: error }, 'Error searching players');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.getLeague(req.params.leagueId);
      res.json(league);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching league');
      res.status(404).json({ error: error.message });
    }
  };

  updateLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.updateLeague(req.params.leagueId, req.body);
      res.json(league);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating league');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  deleteLeague = async (req: Request, res: Response) => {
    try {
      const result = await this.leagueService.deleteLeague(req.params.leagueId);
      res.status(200).json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error deleting league');
      const isNotFound = error.message?.includes('not found') || error.message?.includes('already deleted');
      res.status(isNotFound ? 404 : 400).json({ error: error.message });
    }
  };

  activateLeague = async (req: Request, res: Response) => {
    try {
      const result = await this.leagueService.activateLeague(req.params.leagueId);

      if ('conflicts' in result) {
        return res.status(409).json({
          error: 'Cannot activate league — booking conflicts exist',
          conflicts: result.conflicts,
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error activating league');
      res.status(400).json({ error: error.message });
    }
  };

  checkConflicts = async (req: Request, res: Response) => {
    try {
      const result = await this.leagueService.checkLeagueBookingConflicts(req.params.leagueId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking league booking conflicts');
      res.status(400).json({ error: error.message });
    }
  };

  completeLeague = async (req: Request, res: Response) => {
    try {
      const league = await this.leagueService.completeLeague(req.params.leagueId);
      res.json(league);
    } catch (error: any) {
      logger.error({ err: error }, 'Error completing league');
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
      logger.error({ err: error }, 'Error adding course');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getCourses = async (req: Request, res: Response) => {
    try {
      const courses = await this.leagueService.getCourses(req.params.leagueId);
      res.json(courses);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching courses');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  updateCourse = async (req: Request, res: Response) => {
    try {
      const course = await this.leagueService.updateCourse(req.params.courseId, req.body);
      res.json(course);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating course');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  deleteCourse = async (req: Request, res: Response) => {
    try {
      await this.leagueService.deleteCourse(req.params.courseId);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error deleting course');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error assigning course to week');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // PLAYER ENROLLMENT
  // =====================================================

  enrollPlayer = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const enrollData = { ...req.body, userId };
      const player = await this.leagueService.enrollPlayer(req.params.leagueId, enrollData);
      res.status(201).json(player);
    } catch (error: any) {
      logger.error({ err: error }, 'Error enrolling player');
      if (error.message.includes('already enrolled')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('full')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getPlayers = async (req: Request, res: Response) => {
    try {
      const players = await this.leagueService.getPlayers(req.params.leagueId);
      res.json(players);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching players');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  withdrawPlayer = async (req: Request, res: Response) => {
    try {
      await this.leagueService.withdrawPlayer(req.params.leagueId, req.params.playerId);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error withdrawing player');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // REFUNDS
  // =====================================================

  refundWeeklyBuyIn = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'Reason is required' });
      }
      if (!req.employeeProfile?.id) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }
      const issuedBy = req.employeeProfile.id;
      const result = await this.leagueService.refundWeeklyBuyIn(
        req.params.leagueId, req.params.playerId, reason.trim(), issuedBy
      );
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error issuing weekly refund');
      res.status(400).json({ error: error.message });
    }
  };

  removeAndRefund = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { refundType, reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'Reason is required' });
      }
      if (!['full', 'prorated', 'none'].includes(refundType)) {
        return res.status(400).json({ error: 'refundType must be full, prorated, or none' });
      }
      if (!req.employeeProfile?.id) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }
      const issuedBy = req.employeeProfile.id;
      const result = await this.leagueService.removeAndRefund(
        req.params.leagueId, req.params.playerId, refundType, reason.trim(), issuedBy
      );
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error removing player with refund');
      res.status(400).json({ error: error.message });
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
      const overriddenBy = (req as AuthenticatedRequest).employeeProfile?.id || 'unknown';

      await this.leagueService.overrideHandicap(
        req.params.leagueId,
        req.params.playerId,
        handicap,
        overriddenBy,
        reason
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error overriding handicap');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error fetching weeks');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  activateWeek = async (req: Request, res: Response) => {
    try {
      const week = await this.leagueService.activateWeek(req.params.leagueId, req.params.weekId);
      res.json(week);
    } catch (error: any) {
      logger.error({ err: error }, 'Error activating week');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error finalizing week');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // SCORE ENTRY
  // =====================================================

  submitScore = async (req: Request, res: Response) => {
    try {
      // Support both single score and batch: { entries: [{ leaguePlayerId, holeNumber, strokes }] }
      const entries = (req.body.entries
        ? req.body.entries.map((e: any) => ({ ...e, leagueWeekId: req.body.leagueWeekId || e.leagueWeekId, spaceId: req.body.spaceId || e.spaceId, enteredVia: req.body.enteredVia || e.enteredVia || 'kiosk' }))
        : [req.body]) as SubmitScoreRequest[];

      // Validate all entries upfront
      for (const entry of entries) {
        if (!entry.leagueWeekId || !entry.leaguePlayerId || !entry.holeNumber || entry.strokes === undefined) {
          return res.status(400).json({ error: `Missing required fields for player ${entry.leaguePlayerId || 'unknown'}` });
        }
      }

      const league = await this.leagueService.getLeague(req.params.leagueId);
      const players = await this.leagueService.getPlayers(req.params.leagueId);
      const results: SubmitScoreResult[] = [];

      for (const entry of entries) {
        const result = await this.leagueService.submitScore(entry);
        results.push(result);

        // Broadcast per-player score update via Socket.io
        const player = players.find(p => p.id === entry.leaguePlayerId);
        if (player) {
          const payload: LeagueScorePayload = {
            type: 'league_score_update',
            leagueId: league.id,
            weekId: entry.leagueWeekId,
            player: {
              id: player.id,
              displayName: player.display_name,
              handicap: player.current_handicap,
            },
            holeNumber: entry.holeNumber,
            strokes: entry.strokes,
            roundGross: result.round_gross,
            holesCompleted: result.holes_entered,
            totalHoles: result.total_holes,
            timestamp: new Date().toISOString(),
          };
          this.socketService.emitScoreUpdate(league.location_id, league.id, payload);
        }
      }

      // Return single result for backward compat, or array for batch
      res.json(entries.length === 1 ? results[0] : results);
    } catch (error: any) {
      logger.error({ err: error }, 'Error submitting score');
      const status = error.message.includes('not found') || error.message.includes('Must be active') || error.message.includes('Cannot submit') || error.message.includes('exceeds') ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  };

  submitScoresBulk = async (req: Request, res: Response) => {
    try {
      const { leagueWeekId, leaguePlayerId, scores } = req.body;
      if (!leagueWeekId || !leaguePlayerId || !Array.isArray(scores) || scores.length === 0) {
        return res.status(400).json({ error: 'leagueWeekId, leaguePlayerId, and scores array are required' });
      }

      const result = await this.leagueService.submitScoresBulk(req.params.leagueId, req.body);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error submitting bulk scores');
      const status = error.message.includes('not found') || error.message.includes('Must be active') || error.message.includes('Cannot submit') ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  };

  getWeekScores = async (req: Request, res: Response) => {
    try {
      const scores = await this.leagueService.getWeekScores(req.params.leagueId, req.params.weekId);
      res.json(scores);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching week scores');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error fetching player scorecard');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // SCORE AUDITABILITY — CONFIRM / OVERRIDE
  // =====================================================

  confirmScore = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as AuthenticatedRequest).employeeProfile?.id || 'unknown';
      await this.leagueService.confirmScore(req.params.scoreId, confirmedBy);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error confirming score');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  confirmWeekScores = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as AuthenticatedRequest).employeeProfile?.id || 'unknown';
      const count = await this.leagueService.confirmWeekScores(req.params.weekId, confirmedBy);
      res.json({ success: true, confirmed: count });
    } catch (error: any) {
      logger.error({ err: error }, 'Error confirming week scores');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  overrideScore = async (req: Request, res: Response) => {
    try {
      const { strokes, reason } = req.body;
      if (strokes === undefined || !reason) {
        return res.status(400).json({ error: 'strokes and reason are required' });
      }

      const overriddenBy = (req as AuthenticatedRequest).employeeProfile?.id || 'unknown';
      await this.leagueService.overrideScore(req.params.scoreId, strokes, overriddenBy, reason);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error overriding score');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error fetching standings');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getLiveLeaderboard = async (req: Request, res: Response) => {
    try {
      const leaderboard = await this.leagueService.getLiveLeaderboard(req.params.leagueId);
      res.json(leaderboard);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching live leaderboard');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getTeamLeaderboard = async (req: Request, res: Response) => {
    try {
      const leaderboard = await this.leagueService.getTeamLeaderboard(req.params.leagueId);
      res.json(leaderboard);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching team leaderboard');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // PAYMENT
  // =====================================================

  enrollAndPay = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { displayName, initialHandicap } = req.body;
      if (!userId || !displayName) {
        return res.status(400).json({ error: 'displayName is required' });
      }

      const result = await this.leagueService.enrollAndPay(
        req.params.leagueId,
        userId,
        displayName,
        typeof initialHandicap === 'number' ? initialHandicap : 0
      );

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in enroll-and-pay');
      if (error.message.includes('already enrolled') || error.message.includes('full')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('not accepting')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // USER-FACING: My Leagues
  // =====================================================

  getUserLeagues = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const authenticatedUserId = req.user?.id;
      if (authenticatedUserId !== userId) {
        return res.status(403).json({ error: 'Access denied: can only view your own leagues' });
      }

      const leagues = await this.leagueService.getLeaguesForUser(userId);
      res.json(leagues);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching user leagues');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error fetching league state for kiosk');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error fetching prize pool summary');
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error fetching player prize history');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  confirmWeekPayouts = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as AuthenticatedRequest).employeeProfile?.id || 'unknown';
      await this.leagueService.confirmWeekPayouts(
        req.params.leagueId,
        req.params.weekId,
        confirmedBy
      );
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error confirming week payouts');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  confirmSinglePayout = async (req: Request, res: Response) => {
    try {
      const confirmedBy = (req as AuthenticatedRequest).employeeProfile?.id || 'unknown';
      await this.leagueService.confirmPayout(req.params.entryId, confirmedBy);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error confirming payout');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // TEAM MANAGEMENT
  // =====================================================

  createTeam = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const captainUserId = req.user?.id;
      const { teamName } = req.body;
      if (!captainUserId || !teamName) {
        return res.status(400).json({ error: 'teamName is required' });
      }
      const team = await this.leagueService.createTeam(req.params.leagueId, captainUserId, teamName);
      res.status(201).json(team);
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating team');
      if (error.message.includes('already on a team') || error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('does not support') || error.message.includes('not accepting')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getTeams = async (req: Request, res: Response) => {
    try {
      const teams = await this.leagueService.getTeams(req.params.leagueId);
      res.json(teams);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching teams');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getTeam = async (req: Request, res: Response) => {
    try {
      const team = await this.leagueService.getTeam(req.params.teamId);
      res.json(team);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching team');
      res.status(404).json({ error: error.message });
    }
  };

  inviteTeammates = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const captainUserId = req.user?.id;
      const { emails } = req.body;
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: 'emails array is required' });
      }
      if (!captainUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const result = await this.leagueService.inviteTeammates(req.params.teamId, captainUserId, emails);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error inviting teammates');
      if (error.message.includes('Only the team captain') || error.message.includes('no longer accepting')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getInviteByToken = async (req: Request, res: Response) => {
    try {
      const invite = await this.leagueService.getInviteByToken(req.params.token);
      res.json(invite);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching invite');
      res.status(404).json({ error: error.message });
    }
  };

  acceptInvite = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const result = await this.leagueService.acceptInvite(req.params.token, userId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error accepting invite');
      if (error.message.includes('not sent to you') || error.message.includes('already been')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  declineInvite = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      await this.leagueService.declineInvite(req.params.token, userId);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error declining invite');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  enrollTeamPlayer = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { displayName, initialHandicap } = req.body;
      if (!userId || !displayName) {
        return res.status(400).json({ error: 'displayName is required' });
      }
      const result = await this.leagueService.enrollTeamPlayer(
        req.params.leagueId,
        req.params.teamId,
        userId,
        displayName,
        typeof initialHandicap === 'number' ? initialHandicap : 0
      );
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in team enroll-and-pay');
      if (error.message.includes('already paid')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('does not support') || error.message.includes('cannot accept')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
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
      logger.error({ err: error }, 'Error disqualifying team');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getUserTeams = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const authenticatedUserId = req.user?.id;
      if (authenticatedUserId !== userId) {
        return res.status(403).json({ error: 'Access denied: can only view your own teams' });
      }

      const teams = await this.leagueService.getUserTeams(userId);
      res.json(teams);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching user teams');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // ATTENDANCE CONFIRMATION
  // =====================================================

  /**
   * Token-based confirm (from email link, no auth required)
   */
  confirmAttendanceByToken = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const result = await this.attendanceService.confirmAttendance(token);
      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error confirming attendance');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Token-based decline (from email link, no auth required)
   */
  declineAttendanceByToken = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const result = await this.attendanceService.declineAttendance(token);
      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error declining attendance');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Get attendance list for a week (employee view)
   */
  getWeekAttendance = async (req: Request, res: Response) => {
    try {
      const { weekId } = req.params;
      const attendance = await this.attendanceService.getAttendanceForWeek(weekId);
      res.json(attendance);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching week attendance');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Get attendance summary for a week
   */
  getWeekAttendanceSummary = async (req: Request, res: Response) => {
    try {
      const { leagueId, weekId } = req.params;

      // Get players_per_space from league
      const league = await this.leagueService.getLeague(leagueId);
      const playersPerSpace = (league as any)?.players_per_space || 2;

      const summary = await this.attendanceService.getAttendanceSummary(weekId, playersPerSpace);
      res.json(summary);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching attendance summary');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Update own attendance (auth-based, from user dashboard)
   */
  updateAttendance = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { leagueId, weekId } = req.params;
      const { status } = req.body;
      const userId = req.user?.id;

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      if (!['confirmed', 'declined'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "confirmed" or "declined"' });
      }

      // Look up the player record by authenticated userId + leagueId
      const playerId = await this.leagueService.getActivePlayerIdForUser(userId, leagueId);
      if (!playerId) {
        return res.status(404).json({ error: 'You are not enrolled in this league' });
      }

      const attendance = await this.attendanceService.updateAttendance(playerId, weekId, status);
      res.json(attendance);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating attendance');
      if (error.message.includes('locked') || error.message.includes('not found')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Get all my attendance statuses across weeks for a league
   */
  getPlayerAttendance = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { leagueId, userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const attendance = await this.attendanceService.getPlayerAttendance(userId, leagueId);
      res.json(attendance);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching player attendance (employee)');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getMyAttendance = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const attendance = await this.attendanceService.getPlayerAttendance(userId, leagueId);
      res.json(attendance);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching player attendance');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Employee: manually trigger capacity adjustment for a week
   */
  manualAdjustCapacity = async (req: Request, res: Response) => {
    try {
      const { leagueId, weekId } = req.params;
      const result = await this.attendanceService.adjustCapacityHold(leagueId, weekId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error adjusting capacity');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Get all capacity holds for a league (schedule view)
   */
  getLeagueHolds = async (req: Request, res: Response) => {
    try {
      const { leagueId } = req.params;
      const holds = await this.capacityHoldService.getHoldsForLeague(leagueId);
      res.json(holds);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching league holds');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Employee: skip a week (holiday) — suspends the capacity hold for that week
   */
  skipWeek = async (req: Request, res: Response) => {
    try {
      const { leagueId, weekId } = req.params;

      // Find the capacity hold for this week
      const holds = await this.capacityHoldService.getHoldsForLeague(leagueId);
      const weekHold = holds.find(h => h.league_week_id === weekId && h.status === 'active');

      if (!weekHold) {
        return res.status(404).json({ error: 'No active hold found for this week' });
      }

      await this.capacityHoldService.suspendHold(weekHold.id);
      res.json({ success: true, message: 'Week skipped — hold suspended and spaces released.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error skipping week');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  /**
   * Employee: unskip a week — reactivates the capacity hold for that week
   */
  unskipWeek = async (req: Request, res: Response) => {
    try {
      const { leagueId, weekId } = req.params;

      // Find the suspended hold for this week
      const holds = await this.capacityHoldService.getHoldsForLeague(leagueId);
      const weekHold = holds.find(h => h.league_week_id === weekId && h.status === 'suspended');

      if (!weekHold) {
        return res.status(404).json({ error: 'No suspended hold found for this week' });
      }

      await this.capacityHoldService.activateHold(weekHold.id);
      res.json({ success: true, message: 'Week restored — hold reactivated.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error unskipping week');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
}
