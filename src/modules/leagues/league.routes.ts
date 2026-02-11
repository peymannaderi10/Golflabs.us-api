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

  // --- Player enrollment ---
  router.post('/:leagueId/enroll', controller.enrollPlayer);
  router.get('/:leagueId/players', controller.getPlayers);
  router.post('/:leagueId/players/:playerId/withdraw', authenticateEmployee, controller.withdrawPlayer);

  // --- Weekly sessions ---
  router.get('/:leagueId/weeks', controller.getWeeks);
  router.post('/:leagueId/weeks/:weekId/activate', authenticateEmployee, controller.activateWeek);
  router.post('/:leagueId/weeks/:weekId/finalize', authenticateEmployee, controller.finalizeWeek);

  // --- Score entry (kiosk + employee — no auth required for kiosk) ---
  router.post('/:leagueId/scores', controller.submitScore);
  router.get('/:leagueId/weeks/:weekId/scores', controller.getWeekScores);
  router.get('/:leagueId/weeks/:weekId/scorecard/:playerId', controller.getPlayerScorecard);

  // --- Leaderboard (public, no auth) ---
  router.get('/:leagueId/standings', controller.getStandings);
  router.get('/:leagueId/leaderboard', controller.getLiveLeaderboard);

  // --- Payments ---
  router.post('/:leagueId/enroll-and-pay', controller.enrollAndPay);

  // --- Kiosk state ---
  router.get('/:leagueId/kiosk-state', controller.getLeagueStateForKiosk);           // ?playerId= or ?userId=

  return router;
};
