import { Router } from 'express';
import { LeagueController } from './league.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee } from '../bookings/employee.middleware';

export const createLeagueRoutes = (socketService: SocketService): Router => {
  const router = Router();
  const controller = new LeagueController(socketService);

  // --- League CRUD (employee-only for create/update/activate) ---
  router.post('/', authenticateEmployee, controller.createLeague);
  router.get('/', controller.getLeaguesByLocation);                                 // ?locationId=

  // --- User-facing: my leagues (must be before /:leagueId to avoid capture) ---
  router.get('/user/:userId', controller.getUserLeagues);

  router.get('/:leagueId', controller.getLeague);
  router.put('/:leagueId', authenticateEmployee, controller.updateLeague);
  router.post('/:leagueId/activate', authenticateEmployee, controller.activateLeague);

  // --- Course management ---
  router.post('/:leagueId/courses', authenticateEmployee, controller.addCourse);
  router.get('/:leagueId/courses', controller.getCourses);
  router.put('/:leagueId/courses/:courseId', authenticateEmployee, controller.updateCourse);
  router.delete('/:leagueId/courses/:courseId', authenticateEmployee, controller.deleteCourse);

  // --- Player enrollment ---
  router.post('/:leagueId/enroll', controller.enrollPlayer);
  router.get('/:leagueId/players', controller.getPlayers);
  router.post('/:leagueId/players/:playerId/withdraw', authenticateEmployee, controller.withdrawPlayer);
  router.post('/:leagueId/players/:playerId/override-handicap', authenticateEmployee, controller.overrideHandicap);

  // --- Weekly sessions ---
  router.get('/:leagueId/weeks', controller.getWeeks);
  router.post('/:leagueId/weeks/:weekId/activate', authenticateEmployee, controller.activateWeek);
  router.post('/:leagueId/weeks/:weekId/finalize', authenticateEmployee, controller.finalizeWeek);
  router.post('/:leagueId/weeks/:weekId/assign-course', authenticateEmployee, controller.assignCourseToWeek);
  router.post('/:leagueId/weeks/:weekId/confirm-scores', authenticateEmployee, controller.confirmWeekScores);

  // --- Score entry (kiosk + employee — no auth required for kiosk) ---
  router.post('/:leagueId/scores', controller.submitScore);
  router.get('/:leagueId/weeks/:weekId/scores', controller.getWeekScores);
  router.get('/:leagueId/weeks/:weekId/scorecard/:playerId', controller.getPlayerScorecard);

  // --- Score auditability (employee-only) ---
  router.post('/:leagueId/scores/:scoreId/confirm', authenticateEmployee, controller.confirmScore);
  router.post('/:leagueId/scores/:scoreId/override', authenticateEmployee, controller.overrideScore);

  // --- Leaderboard (public, no auth) ---
  router.get('/:leagueId/standings', controller.getStandings);
  router.get('/:leagueId/leaderboard', controller.getLiveLeaderboard);
  router.get('/:leagueId/team-leaderboard', controller.getTeamLeaderboard);

  // --- Payments ---
  router.post('/:leagueId/enroll-and-pay', controller.enrollAndPay);

  // --- Prize pool ledger ---
  router.get('/:leagueId/prize-pool', controller.getPrizePoolSummary);
  router.get('/:leagueId/prize-pool/player/:playerId', controller.getPlayerPrizeHistory);
  router.post('/:leagueId/weeks/:weekId/confirm-payouts', authenticateEmployee, controller.confirmWeekPayouts);
  router.post('/:leagueId/prize-ledger/:entryId/confirm', authenticateEmployee, controller.confirmSinglePayout);

  // --- Kiosk state ---
  router.get('/:leagueId/kiosk-state', controller.getLeagueStateForKiosk);           // ?playerId= or ?userId=

  // --- Team management ---
  router.post('/:leagueId/teams', controller.createTeam);
  router.get('/:leagueId/teams', controller.getTeams);
  router.get('/:leagueId/teams/:teamId', controller.getTeam);
  router.post('/:leagueId/teams/:teamId/invites', controller.inviteTeammates);
  router.post('/:leagueId/teams/:teamId/pay', controller.enrollTeamPlayer);
  router.post('/:leagueId/teams/:teamId/disqualify', authenticateEmployee, controller.disqualifyTeam);

  // --- Attendance confirmation (authenticated) ---
  router.get('/:leagueId/weeks/:weekId/attendance', controller.getWeekAttendance);
  router.get('/:leagueId/weeks/:weekId/attendance/summary', controller.getWeekAttendanceSummary);
  router.put('/:leagueId/weeks/:weekId/attendance', controller.updateAttendance);
  router.get('/:leagueId/attendance/me', controller.getMyAttendance);
  router.post('/:leagueId/weeks/:weekId/attendance/adjust', authenticateEmployee, controller.manualAdjustCapacity);

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
  router.post('/:token/accept', controller.acceptInvite);
  router.post('/:token/decline', controller.declineInvite);

  // User's teams
  router.get('/user/:userId/teams', controller.getUserTeams);

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
