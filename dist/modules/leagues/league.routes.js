"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTeamInviteRoutes = exports.createLeagueRoutes = void 0;
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
    // --- Course management ---
    router.post('/:leagueId/courses', employee_middleware_1.authenticateEmployee, controller.addCourse);
    router.get('/:leagueId/courses', controller.getCourses);
    router.put('/:leagueId/courses/:courseId', employee_middleware_1.authenticateEmployee, controller.updateCourse);
    router.delete('/:leagueId/courses/:courseId', employee_middleware_1.authenticateEmployee, controller.deleteCourse);
    // --- Player enrollment ---
    router.post('/:leagueId/enroll', controller.enrollPlayer);
    router.get('/:leagueId/players', controller.getPlayers);
    router.post('/:leagueId/players/:playerId/withdraw', employee_middleware_1.authenticateEmployee, controller.withdrawPlayer);
    router.post('/:leagueId/players/:playerId/override-handicap', employee_middleware_1.authenticateEmployee, controller.overrideHandicap);
    // --- Weekly sessions ---
    router.get('/:leagueId/weeks', controller.getWeeks);
    router.post('/:leagueId/weeks/:weekId/activate', employee_middleware_1.authenticateEmployee, controller.activateWeek);
    router.post('/:leagueId/weeks/:weekId/finalize', employee_middleware_1.authenticateEmployee, controller.finalizeWeek);
    router.post('/:leagueId/weeks/:weekId/assign-course', employee_middleware_1.authenticateEmployee, controller.assignCourseToWeek);
    router.post('/:leagueId/weeks/:weekId/confirm-scores', employee_middleware_1.authenticateEmployee, controller.confirmWeekScores);
    // --- Score entry (kiosk + employee — no auth required for kiosk) ---
    router.post('/:leagueId/scores', controller.submitScore);
    router.get('/:leagueId/weeks/:weekId/scores', controller.getWeekScores);
    router.get('/:leagueId/weeks/:weekId/scorecard/:playerId', controller.getPlayerScorecard);
    // --- Score auditability (employee-only) ---
    router.post('/:leagueId/scores/:scoreId/confirm', employee_middleware_1.authenticateEmployee, controller.confirmScore);
    router.post('/:leagueId/scores/:scoreId/override', employee_middleware_1.authenticateEmployee, controller.overrideScore);
    // --- Leaderboard (public, no auth) ---
    router.get('/:leagueId/standings', controller.getStandings);
    router.get('/:leagueId/leaderboard', controller.getLiveLeaderboard);
    router.get('/:leagueId/team-leaderboard', controller.getTeamLeaderboard);
    // --- Payments ---
    router.post('/:leagueId/enroll-and-pay', controller.enrollAndPay);
    // --- Prize pool ledger ---
    router.get('/:leagueId/prize-pool', controller.getPrizePoolSummary);
    router.get('/:leagueId/prize-pool/player/:playerId', controller.getPlayerPrizeHistory);
    router.post('/:leagueId/weeks/:weekId/confirm-payouts', employee_middleware_1.authenticateEmployee, controller.confirmWeekPayouts);
    router.post('/:leagueId/prize-ledger/:entryId/confirm', employee_middleware_1.authenticateEmployee, controller.confirmSinglePayout);
    // --- Kiosk state ---
    router.get('/:leagueId/kiosk-state', controller.getLeagueStateForKiosk); // ?playerId= or ?userId=
    // --- Team management ---
    router.post('/:leagueId/teams', controller.createTeam);
    router.get('/:leagueId/teams', controller.getTeams);
    router.get('/:leagueId/teams/:teamId', controller.getTeam);
    router.post('/:leagueId/teams/:teamId/invites', controller.inviteTeammates);
    router.post('/:leagueId/teams/:teamId/pay', controller.enrollTeamPlayer);
    router.post('/:leagueId/teams/:teamId/disqualify', employee_middleware_1.authenticateEmployee, controller.disqualifyTeam);
    // --- Team invites (public - token-based) ---
    // Note: these routes are mounted BEFORE /:leagueId to avoid route capture
    return router;
};
exports.createLeagueRoutes = createLeagueRoutes;
/**
 * Creates team invite routes that are NOT nested under /:leagueId.
 * Mount these at /api/team-invites
 */
const createTeamInviteRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const controller = new league_controller_1.LeagueController(socketService);
    router.get('/:token', controller.getInviteByToken);
    router.post('/:token/accept', controller.acceptInvite);
    router.post('/:token/decline', controller.declineInvite);
    // User's teams
    router.get('/user/:userId/teams', controller.getUserTeams);
    return router;
};
exports.createTeamInviteRoutes = createTeamInviteRoutes;
