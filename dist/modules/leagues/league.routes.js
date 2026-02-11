"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLeagueRoutes = void 0;
const express_1 = require("express");
const league_controller_1 = require("./league.controller");
const employee_middleware_1 = require("../bookings/employee.middleware");
const createLeagueRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const controller = new league_controller_1.LeagueController(socketService);
    // --- League CRUD (employee-only for create/update/activate) ---
    router.post('/', employee_middleware_1.authenticateEmployee, controller.createLeague);
    router.get('/', controller.getLeaguesByLocation); // ?locationId=
    // --- User-facing: my leagues (must be before /:leagueId to avoid capture) ---
    router.get('/user/:userId', controller.getUserLeagues);
    router.get('/:leagueId', controller.getLeague);
    router.put('/:leagueId', employee_middleware_1.authenticateEmployee, controller.updateLeague);
    router.post('/:leagueId/activate', employee_middleware_1.authenticateEmployee, controller.activateLeague);
    // --- Player enrollment ---
    router.post('/:leagueId/enroll', controller.enrollPlayer);
    router.get('/:leagueId/players', controller.getPlayers);
    router.post('/:leagueId/players/:playerId/withdraw', employee_middleware_1.authenticateEmployee, controller.withdrawPlayer);
    // --- Weekly sessions ---
    router.get('/:leagueId/weeks', controller.getWeeks);
    router.post('/:leagueId/weeks/:weekId/activate', employee_middleware_1.authenticateEmployee, controller.activateWeek);
    router.post('/:leagueId/weeks/:weekId/finalize', employee_middleware_1.authenticateEmployee, controller.finalizeWeek);
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
    router.get('/:leagueId/kiosk-state', controller.getLeagueStateForKiosk); // ?playerId= or ?userId=
    return router;
};
exports.createLeagueRoutes = createLeagueRoutes;
