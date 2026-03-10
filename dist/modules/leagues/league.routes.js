"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAttendanceRoutes = exports.createTeamInviteRoutes = exports.createLeagueRoutes = void 0;
const express_1 = require("express");
const league_controller_1 = require("./league.controller");
const auth_1 = require("../auth");
const express_validator_1 = require("express-validator");
const validation_1 = require("../../shared/middleware/validation");
const createLeagueRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const controller = new league_controller_1.LeagueController(socketService);
    // --- League CRUD (employee-only for create/update/activate) ---
    router.post('/', auth_1.authenticateEmployee, [
        (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'),
        (0, express_validator_1.body)('name').isString().notEmpty().withMessage('name is required'),
        validation_1.handleValidationErrors,
    ], controller.createLeague);
    router.get('/', controller.getLeaguesByLocation); // ?locationId=
    // --- User-facing: my leagues (must be before /:leagueId to avoid capture) ---
    router.get('/user/:userId', auth_1.authenticateUser, controller.getUserLeagues);
    router.get('/:leagueId', [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.getLeague);
    router.put('/:leagueId', auth_1.authenticateEmployee, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.updateLeague);
    router.delete('/:leagueId', auth_1.authenticateEmployee, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.deleteLeague);
    router.post('/:leagueId/activate', auth_1.authenticateEmployee, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.activateLeague);
    // --- Course management ---
    router.post('/:leagueId/courses', auth_1.authenticateEmployee, controller.addCourse);
    router.get('/:leagueId/courses', controller.getCourses);
    router.put('/:leagueId/courses/:courseId', auth_1.authenticateEmployee, controller.updateCourse);
    router.delete('/:leagueId/courses/:courseId', auth_1.authenticateEmployee, controller.deleteCourse);
    // --- Player enrollment ---
    router.post('/:leagueId/enroll', [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.enrollPlayer);
    router.get('/:leagueId/players', controller.getPlayers);
    router.post('/:leagueId/players/:playerId/withdraw', auth_1.authenticateEmployee, controller.withdrawPlayer);
    router.post('/:leagueId/players/:playerId/override-handicap', auth_1.authenticateEmployee, controller.overrideHandicap);
    // --- Weekly sessions ---
    router.get('/:leagueId/weeks', controller.getWeeks);
    router.post('/:leagueId/weeks/:weekId/activate', auth_1.authenticateEmployee, controller.activateWeek);
    router.post('/:leagueId/weeks/:weekId/finalize', auth_1.authenticateEmployee, controller.finalizeWeek);
    router.post('/:leagueId/weeks/:weekId/assign-course', auth_1.authenticateEmployee, controller.assignCourseToWeek);
    router.post('/:leagueId/weeks/:weekId/confirm-scores', auth_1.authenticateEmployee, controller.confirmWeekScores);
    router.post('/:leagueId/scores', auth_1.authenticateKiosk, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.submitScore);
    router.get('/:leagueId/weeks/:weekId/scores', controller.getWeekScores);
    router.get('/:leagueId/weeks/:weekId/scorecard/:playerId', controller.getPlayerScorecard);
    // --- Score auditability (employee-only) ---
    router.post('/:leagueId/scores/:scoreId/confirm', auth_1.authenticateEmployee, controller.confirmScore);
    router.post('/:leagueId/scores/:scoreId/override', auth_1.authenticateEmployee, controller.overrideScore);
    // --- Leaderboard (public, no auth) ---
    router.get('/:leagueId/standings', controller.getStandings);
    router.get('/:leagueId/leaderboard', controller.getLiveLeaderboard);
    router.get('/:leagueId/team-leaderboard', controller.getTeamLeaderboard);
    // --- Payments (authenticated user) ---
    router.post('/:leagueId/enroll-and-pay', auth_1.authenticateUser, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.enrollAndPay);
    // --- Prize pool ledger ---
    router.get('/:leagueId/prize-pool', controller.getPrizePoolSummary);
    router.get('/:leagueId/prize-pool/player/:playerId', controller.getPlayerPrizeHistory);
    router.post('/:leagueId/weeks/:weekId/confirm-payouts', auth_1.authenticateEmployee, controller.confirmWeekPayouts);
    router.post('/:leagueId/prize-ledger/:entryId/confirm', auth_1.authenticateEmployee, controller.confirmSinglePayout);
    router.get('/:leagueId/kiosk-state', auth_1.authenticateKiosk, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.getLeagueStateForKiosk);
    // --- Team management (authenticated user for create/invite/pay) ---
    router.post('/:leagueId/teams', auth_1.authenticateUser, [
        (0, express_validator_1.param)('leagueId').isUUID().withMessage('leagueId must be a valid UUID'),
        validation_1.handleValidationErrors,
    ], controller.createTeam);
    router.get('/:leagueId/teams', controller.getTeams);
    router.get('/:leagueId/teams/:teamId', controller.getTeam);
    router.post('/:leagueId/teams/:teamId/invites', auth_1.authenticateUser, controller.inviteTeammates);
    router.post('/:leagueId/teams/:teamId/pay', auth_1.authenticateUser, controller.enrollTeamPlayer);
    router.post('/:leagueId/teams/:teamId/disqualify', auth_1.authenticateEmployee, controller.disqualifyTeam);
    // --- Week management (employee-only) ---
    router.get('/:leagueId/holds', controller.getLeagueHolds);
    router.post('/:leagueId/weeks/:weekId/skip', auth_1.authenticateEmployee, controller.skipWeek);
    router.post('/:leagueId/weeks/:weekId/unskip', auth_1.authenticateEmployee, controller.unskipWeek);
    // --- Attendance confirmation ---
    router.get('/:leagueId/weeks/:weekId/attendance', controller.getWeekAttendance);
    router.get('/:leagueId/weeks/:weekId/attendance/summary', controller.getWeekAttendanceSummary);
    router.put('/:leagueId/weeks/:weekId/attendance', auth_1.authenticateUser, controller.updateAttendance);
    router.get('/:leagueId/attendance/me', auth_1.authenticateUser, controller.getMyAttendance);
    router.post('/:leagueId/weeks/:weekId/attendance/adjust', auth_1.authenticateEmployee, controller.manualAdjustCapacity);
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
    router.post('/:token/accept', auth_1.authenticateUser, controller.acceptInvite);
    router.post('/:token/decline', auth_1.authenticateUser, controller.declineInvite);
    // User's teams
    router.get('/user/:userId/teams', auth_1.authenticateUser, controller.getUserTeams);
    return router;
};
exports.createTeamInviteRoutes = createTeamInviteRoutes;
/**
 * Creates public attendance confirmation routes (token-based, no auth).
 * Mount these at /attendance
 */
const createAttendanceRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const controller = new league_controller_1.LeagueController(socketService);
    router.post('/confirm/:token', controller.confirmAttendanceByToken);
    router.post('/decline/:token', controller.declineAttendanceByToken);
    return router;
};
exports.createAttendanceRoutes = createAttendanceRoutes;
