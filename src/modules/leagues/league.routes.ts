import { Router } from 'express';
import { LeagueController } from './league.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateUser, authenticateKiosk, authenticateKioskOrEmployee, enforceLocationScope } from '../auth';
import { body, param, query } from 'express-validator';
import { handleValidationErrors } from '../../shared/middleware/validation';
import { validateLeagueAccess } from './league.middleware';

export const createLeagueRoutes = (socketService: SocketService): Router => {
  const router = Router();
  const controller = new LeagueController(socketService);

  // --- Schedule Preview (no auth needed — stateless) ---
  router.post('/preview-schedule', controller.previewSchedule);

  // --- Course Catalog (no auth — public read) ---
  router.get('/course-catalog', controller.getCourseCatalog);

  // --- League CRUD (employee-only for create/update/activate) ---
  router.post('/', authenticateEmployee, enforceLocationScope, [
    body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    body('name').isString().notEmpty().withMessage('name is required'),
    body('scheduleConfig').isObject().withMessage('scheduleConfig is required'),
    body('scheduleConfig.startDate').isString().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('scheduleConfig.startDate must be YYYY-MM-DD'),
    body('scheduleConfig.daysOfWeek').isArray({ min: 1 }).withMessage('scheduleConfig.daysOfWeek must have at least 1 day'),
    body('scheduleConfig.startTime').isString().matches(/^\d{2}:\d{2}$/).withMessage('scheduleConfig.startTime must be HH:MM'),
    body('scheduleConfig.endTime').isString().matches(/^\d{2}:\d{2}$/).withMessage('scheduleConfig.endTime must be HH:MM'),
    body('numHoles').optional().isInt({ min: 1, max: 18 }).withMessage('numHoles must be 1-18'),
    body('maxPlayers').optional().isInt({ min: 2, max: 200 }).withMessage('maxPlayers must be 2-200'),
    body('seasonFee').optional().isFloat({ min: 0, max: 10000 }).withMessage('seasonFee must be 0-10000'),
    body('playersPerSpace').optional().isInt({ min: 1, max: 8 }).withMessage('playersPerSpace must be 1-8'),
    handleValidationErrors,
  ], controller.createLeague);
  router.get('/', controller.getLeaguesByLocation);                                 // ?locationId=

  // --- User-facing: my leagues (must be before /:leagueId to avoid capture) ---
  router.get('/user/:userId', authenticateUser, controller.getUserLeagues);

  router.get('/:leagueId', [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.getLeague);
  router.put('/:leagueId', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.updateLeague);
  router.delete('/:leagueId', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.deleteLeague);
  router.get('/:leagueId/check-conflicts', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.checkConflicts);
  router.post('/:leagueId/activate', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.activateLeague);
  router.post('/:leagueId/complete', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.completeLeague);

  // --- Course management ---
  router.post('/:leagueId/courses', authenticateEmployee, validateLeagueAccess, controller.addCourse);
  router.get('/:leagueId/courses', controller.getCourses);
  router.put('/:leagueId/courses/:courseId', authenticateEmployee, validateLeagueAccess, controller.updateCourse);
  router.delete('/:leagueId/courses/:courseId', authenticateEmployee, validateLeagueAccess, controller.deleteCourse);

  // --- Player search (kiosk) ---
  router.get('/:leagueId/players/search', authenticateKiosk, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.searchPlayers);

  // --- Player enrollment ---
  router.post('/:leagueId/enroll', authenticateUser, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.enrollPlayer);
  router.get('/:leagueId/players', authenticateEmployee, validateLeagueAccess, controller.getPlayers);
  router.post('/:leagueId/players/:playerId/withdraw', authenticateEmployee, validateLeagueAccess, controller.withdrawPlayer);
  router.post('/:leagueId/players/:playerId/override-handicap', authenticateEmployee, validateLeagueAccess, controller.overrideHandicap);
  router.post('/:leagueId/players/:playerId/refund-weekly', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    param('playerId').isUUID().withMessage('playerId must be a valid UUID'),
    body('reason').isString().notEmpty().isLength({ max: 500 }).withMessage('reason is required (max 500 chars)'),
    handleValidationErrors,
  ], controller.refundWeeklyBuyIn);
  router.post('/:leagueId/players/:playerId/remove-and-refund', authenticateEmployee, validateLeagueAccess, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    param('playerId').isUUID().withMessage('playerId must be a valid UUID'),
    body('refundType').isIn(['full', 'prorated', 'none']).withMessage('refundType must be full, prorated, or none'),
    body('reason').isString().notEmpty().isLength({ max: 500 }).withMessage('reason is required (max 500 chars)'),
    handleValidationErrors,
  ], controller.removeAndRefund);

  // --- Weekly sessions ---
  router.get('/:leagueId/weeks', controller.getWeeks);
  router.post('/:leagueId/weeks/:weekId/activate', authenticateEmployee, validateLeagueAccess, controller.activateWeek);
  router.post('/:leagueId/weeks/:weekId/finalize', authenticateEmployee, validateLeagueAccess, controller.finalizeWeek);
  router.post('/:leagueId/weeks/:weekId/assign-course', authenticateEmployee, validateLeagueAccess, controller.assignCourseToWeek);
  router.post('/:leagueId/weeks/:weekId/confirm-scores', authenticateEmployee, validateLeagueAccess, controller.confirmWeekScores);

  router.post('/:leagueId/scores', authenticateKioskOrEmployee, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.submitScore);
  router.post('/:leagueId/scores/bulk', authenticateEmployee, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.submitScoresBulk);
  router.get('/:leagueId/weeks/:weekId/scores', authenticateKioskOrEmployee, controller.getWeekScores);
  router.get('/:leagueId/weeks/:weekId/scorecard/:playerId', authenticateKioskOrEmployee, controller.getPlayerScorecard);

  // --- Score auditability (employee-only) ---
  router.post('/:leagueId/scores/:scoreId/confirm', authenticateEmployee, validateLeagueAccess, controller.confirmScore);
  router.post('/:leagueId/scores/:scoreId/override', authenticateEmployee, validateLeagueAccess, [
    body('strokes').isInt({ min: 1, max: 20 }).withMessage('strokes must be an integer between 1 and 20'),
    body('reason').isString().notEmpty().isLength({ max: 500 }).withMessage('reason is required (max 500 chars)'),
    handleValidationErrors,
  ], controller.overrideScore);

  // --- Leaderboard (public, no auth) ---
  router.get('/:leagueId/standings', controller.getStandings);
  router.get('/:leagueId/leaderboard', controller.getLiveLeaderboard);
  router.get('/:leagueId/team-leaderboard', controller.getTeamLeaderboard);

  // --- Payments (authenticated user) ---
  router.post('/:leagueId/enroll-and-pay', authenticateUser, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.enrollAndPay);

  // --- Prize pool ledger ---
  router.get('/:leagueId/prize-pool', controller.getPrizePoolSummary);
  router.get('/:leagueId/prize-pool/player/:playerId', controller.getPlayerPrizeHistory);
  router.post('/:leagueId/weeks/:weekId/confirm-payouts', authenticateEmployee, validateLeagueAccess, controller.confirmWeekPayouts);
  router.post('/:leagueId/prize-ledger/:entryId/confirm', authenticateEmployee, validateLeagueAccess, controller.confirmSinglePayout);

  router.get('/:leagueId/kiosk-state', authenticateKiosk, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.getLeagueStateForKiosk);

  // --- Team management (authenticated user for create/invite/pay) ---
  router.post('/:leagueId/teams', authenticateUser, [
    param('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
    handleValidationErrors,
  ], controller.createTeam);
  router.get('/:leagueId/teams', controller.getTeams);
  router.get('/:leagueId/teams/:teamId', controller.getTeam);
  router.post('/:leagueId/teams/:teamId/invites', authenticateUser, controller.inviteTeammates);
  router.post('/:leagueId/teams/:teamId/pay', authenticateUser, controller.enrollTeamPlayer);
  router.post('/:leagueId/teams/:teamId/disqualify', authenticateEmployee, validateLeagueAccess, controller.disqualifyTeam);

  // --- Week management (employee-only) ---
  router.get('/:leagueId/holds', controller.getLeagueHolds);
  router.post('/:leagueId/weeks/:weekId/skip', authenticateEmployee, validateLeagueAccess, controller.skipWeek);
  router.post('/:leagueId/weeks/:weekId/unskip', authenticateEmployee, validateLeagueAccess, controller.unskipWeek);

  // --- Attendance confirmation ---
  router.get('/:leagueId/weeks/:weekId/attendance', controller.getWeekAttendance);
  router.get('/:leagueId/weeks/:weekId/attendance/summary', controller.getWeekAttendanceSummary);
  router.put('/:leagueId/weeks/:weekId/attendance', authenticateUser, controller.updateAttendance);
  router.get('/:leagueId/attendance/me', authenticateUser, controller.getMyAttendance);
  router.get('/:leagueId/attendance/player/:userId', authenticateEmployee, validateLeagueAccess, controller.getPlayerAttendance);
  router.post('/:leagueId/weeks/:weekId/attendance/adjust', authenticateEmployee, validateLeagueAccess, controller.manualAdjustCapacity);

  // --- Team invites (public - token-based) ---
  // Note: these routes are mounted BEFORE /:leagueId to avoid route capture
  return router;
};

/**
 * Creates team invite routes that are NOT nested under /:leagueId.
 * Mount these at /api/team-invites
 */
export const createTeamInviteRoutes = (socketService: SocketService): Router => {
  const router = Router();
  const controller = new LeagueController(socketService);

  router.get('/:token', controller.getInviteByToken);
  router.post('/:token/accept', authenticateUser, controller.acceptInvite);
  router.post('/:token/decline', authenticateUser, controller.declineInvite);

  // User's teams
  router.get('/user/:userId/teams', authenticateUser, controller.getUserTeams);

  return router;
};

/**
 * Creates public attendance confirmation routes (token-based, no auth).
 * Mount these at /attendance
 */
export const createAttendanceRoutes = (socketService: SocketService): Router => {
  const router = Router();
  const controller = new LeagueController(socketService);

  router.post('/confirm/:token', controller.confirmAttendanceByToken);
  router.post('/decline/:token', controller.declineAttendanceByToken);

  return router;
};
