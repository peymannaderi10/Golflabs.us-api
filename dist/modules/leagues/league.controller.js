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
exports.LeagueController = void 0;
const league_service_1 = require("./league.service");
const attendance_service_1 = require("./attendance.service");
const capacity_hold_service_1 = require("../bookings/capacity-hold.service");
const schedule_generator_1 = require("./schedule-generator");
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
class LeagueController {
    constructor(socketService) {
        // =====================================================
        // LEAGUE CRUD
        // =====================================================
        this.createLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.createLeague(req.body);
                res.status(201).json(league);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error creating league');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.previewSchedule = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const config = req.body;
                const sessions = (0, schedule_generator_1.generateSessionDates)(config);
                res.json(sessions);
            }
            catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        this.getLeaguesByLocation = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const leagues = yield this.leagueService.getLeaguesByLocation(locationId);
                res.json(leagues);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching leagues');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getCourseCatalog = (_req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const courses = yield this.leagueService.getCourseCatalog();
                res.json(courses);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching course catalog');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.searchPlayers = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const players = yield this.leagueService.searchPlayers(req.params.leagueId, req.query.q);
                res.json(players);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error searching players');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.getLeague(req.params.leagueId);
                res.json(league);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching league');
                res.status(404).json({ error: error.message });
            }
        });
        this.updateLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.updateLeague(req.params.leagueId, req.body);
                res.json(league);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error updating league');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.deleteLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const result = yield this.leagueService.deleteLeague(req.params.leagueId);
                res.status(200).json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error deleting league');
                const isNotFound = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('already deleted'));
                res.status(isNotFound ? 404 : 400).json({ error: error.message });
            }
        });
        this.activateLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.leagueService.activateLeague(req.params.leagueId);
                if ('conflicts' in result) {
                    return res.status(409).json({
                        error: 'Cannot activate league — booking conflicts exist',
                        conflicts: result.conflicts,
                    });
                }
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error activating league');
                res.status(400).json({ error: error.message });
            }
        });
        this.checkConflicts = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.leagueService.checkLeagueBookingConflicts(req.params.leagueId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error checking league booking conflicts');
                res.status(400).json({ error: error.message });
            }
        });
        this.completeLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.completeLeague(req.params.leagueId);
                res.json(league);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error completing league');
                res.status(400).json({ error: error.message });
            }
        });
        // =====================================================
        // COURSE MANAGEMENT
        // =====================================================
        this.addCourse = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const course = yield this.leagueService.addCourse(req.params.leagueId, req.body);
                res.status(201).json(course);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error adding course');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getCourses = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const courses = yield this.leagueService.getCourses(req.params.leagueId);
                res.json(courses);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching courses');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.updateCourse = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const course = yield this.leagueService.updateCourse(req.params.courseId, req.body);
                res.json(course);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error updating course');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.deleteCourse = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.leagueService.deleteCourse(req.params.courseId);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error deleting course');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.assignCourseToWeek = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { courseId } = req.body;
                if (!courseId) {
                    return res.status(400).json({ error: 'courseId is required' });
                }
                const week = yield this.leagueService.assignCourseToWeek(req.params.weekId, courseId);
                res.json(week);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error assigning course to week');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // PLAYER ENROLLMENT
        // =====================================================
        this.enrollPlayer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                const enrollData = Object.assign(Object.assign({}, req.body), { userId });
                const player = yield this.leagueService.enrollPlayer(req.params.leagueId, enrollData);
                res.status(201).json(player);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error enrolling player');
                if (error.message.includes('already enrolled')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('full')) {
                    return res.status(409).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getPlayers = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const players = yield this.leagueService.getPlayers(req.params.leagueId);
                res.json(players);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching players');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.withdrawPlayer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.leagueService.withdrawPlayer(req.params.leagueId, req.params.playerId);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error withdrawing player');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // REFUNDS
        // =====================================================
        this.refundWeeklyBuyIn = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { reason } = req.body;
                if (!reason || !reason.trim()) {
                    return res.status(400).json({ error: 'Reason is required' });
                }
                if (!((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id)) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const issuedBy = req.employeeProfile.id;
                const result = yield this.leagueService.refundWeeklyBuyIn(req.params.leagueId, req.params.playerId, reason.trim(), issuedBy);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error issuing weekly refund');
                res.status(400).json({ error: error.message });
            }
        });
        this.removeAndRefund = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { refundType, reason } = req.body;
                if (!reason || !reason.trim()) {
                    return res.status(400).json({ error: 'Reason is required' });
                }
                if (!['full', 'prorated', 'none'].includes(refundType)) {
                    return res.status(400).json({ error: 'refundType must be full, prorated, or none' });
                }
                if (!((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id)) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const issuedBy = req.employeeProfile.id;
                const result = yield this.leagueService.removeAndRefund(req.params.leagueId, req.params.playerId, refundType, reason.trim(), issuedBy);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error removing player with refund');
                res.status(400).json({ error: error.message });
            }
        });
        // =====================================================
        // COMMISSIONER POWERS — HANDICAP OVERRIDE
        // =====================================================
        this.overrideHandicap = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { handicap, reason } = req.body;
                if (handicap === undefined || !reason) {
                    return res.status(400).json({ error: 'handicap and reason are required' });
                }
                // Use the authenticated employee's ID as overrider
                const overriddenBy = ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.overrideHandicap(req.params.leagueId, req.params.playerId, handicap, overriddenBy, reason);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error overriding handicap');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // WEEKLY SESSIONS
        // =====================================================
        this.getWeeks = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const weeks = yield this.leagueService.getWeeks(req.params.leagueId);
                res.json(weeks);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching weeks');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.activateWeek = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const week = yield this.leagueService.activateWeek(req.params.leagueId, req.params.weekId);
                res.json(week);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error activating week');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.finalizeWeek = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.leagueService.finalizeWeek(req.params.leagueId, req.params.weekId);
                // Broadcast updated standings via Socket.io
                const league = yield this.leagueService.getLeague(req.params.leagueId);
                this.socketService.emitStandingsUpdate(league.location_id, league.id, {
                    type: 'league_standings_update',
                    leagueId: league.id,
                    standings: result.standings,
                    timestamp: new Date().toISOString(),
                });
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error finalizing week');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // SCORE ENTRY
        // =====================================================
        this.submitScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                // Support both single score and batch: { entries: [{ leaguePlayerId, holeNumber, strokes }] }
                const entries = (req.body.entries
                    ? req.body.entries.map((e) => (Object.assign(Object.assign({}, e), { leagueWeekId: req.body.leagueWeekId || e.leagueWeekId, spaceId: req.body.spaceId || e.spaceId, enteredVia: req.body.enteredVia || e.enteredVia || 'kiosk' })))
                    : [req.body]);
                // Validate all entries upfront
                for (const entry of entries) {
                    if (!entry.leagueWeekId || !entry.leaguePlayerId || !entry.holeNumber || entry.strokes === undefined) {
                        return res.status(400).json({ error: `Missing required fields for player ${entry.leaguePlayerId || 'unknown'}` });
                    }
                }
                const league = yield this.leagueService.getLeague(req.params.leagueId);
                const players = yield this.leagueService.getPlayers(req.params.leagueId);
                const results = [];
                for (const entry of entries) {
                    const result = yield this.leagueService.submitScore(entry);
                    results.push(result);
                    // Broadcast per-player score update via Socket.io
                    const player = players.find(p => p.id === entry.leaguePlayerId);
                    if (player) {
                        const payload = {
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
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error submitting score');
                const status = error.message.includes('not found') || error.message.includes('Must be active') || error.message.includes('Cannot submit') || error.message.includes('exceeds') ? 400 : 500;
                res.status(status).json({ error: error.message });
            }
        });
        this.submitScoresBulk = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueWeekId, leaguePlayerId, scores } = req.body;
                if (!leagueWeekId || !leaguePlayerId || !Array.isArray(scores) || scores.length === 0) {
                    return res.status(400).json({ error: 'leagueWeekId, leaguePlayerId, and scores array are required' });
                }
                const result = yield this.leagueService.submitScoresBulk(req.params.leagueId, req.body);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error submitting bulk scores');
                const status = error.message.includes('not found') || error.message.includes('Must be active') || error.message.includes('Cannot submit') ? 400 : 500;
                res.status(status).json({ error: error.message });
            }
        });
        this.getWeekScores = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const scores = yield this.leagueService.getWeekScores(req.params.leagueId, req.params.weekId);
                res.json(scores);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching week scores');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getPlayerScorecard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const scorecard = yield this.leagueService.getPlayerScorecard(req.params.leagueId, req.params.weekId, req.params.playerId);
                res.json(scorecard);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching player scorecard');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // SCORE AUDITABILITY — CONFIRM / OVERRIDE
        // =====================================================
        this.confirmScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.confirmScore(req.params.scoreId, confirmedBy);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error confirming score');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.confirmWeekScores = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                const count = yield this.leagueService.confirmWeekScores(req.params.weekId, confirmedBy);
                res.json({ success: true, confirmed: count });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error confirming week scores');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.overrideScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { strokes, reason } = req.body;
                if (strokes === undefined || !reason) {
                    return res.status(400).json({ error: 'strokes and reason are required' });
                }
                const overriddenBy = ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.overrideScore(req.params.scoreId, strokes, overriddenBy, reason);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error overriding score');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // STANDINGS & LEADERBOARD
        // =====================================================
        this.getStandings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const standings = yield this.leagueService.getStandings(req.params.leagueId);
                res.json(standings);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching standings');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getLiveLeaderboard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const leaderboard = yield this.leagueService.getLiveLeaderboard(req.params.leagueId);
                res.json(leaderboard);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching live leaderboard');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getTeamLeaderboard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const leaderboard = yield this.leagueService.getTeamLeaderboard(req.params.leagueId);
                res.json(leaderboard);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching team leaderboard');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // PAYMENT
        // =====================================================
        this.enrollAndPay = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { displayName, initialHandicap } = req.body;
                if (!userId || !displayName) {
                    return res.status(400).json({ error: 'displayName is required' });
                }
                const result = yield this.leagueService.enrollAndPay(req.params.leagueId, userId, displayName, typeof initialHandicap === 'number' ? initialHandicap : 0);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in enroll-and-pay');
                if (error.message.includes('already enrolled') || error.message.includes('full')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('not accepting')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // USER-FACING: My Leagues
        // =====================================================
        this.getUserLeagues = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied: can only view your own leagues' });
                }
                const leagues = yield this.leagueService.getLeaguesForUser(userId);
                res.json(leagues);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching user leagues');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // KIOSK STATE
        // =====================================================
        this.getLeagueStateForKiosk = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId } = req.params;
                const { playerId, userId } = req.query;
                if (!playerId && !userId) {
                    return res.status(400).json({ error: 'Either playerId or userId query parameter is required' });
                }
                const state = yield this.leagueService.getLeagueStateForKiosk(leagueId, {
                    playerId: playerId,
                    userId: userId,
                });
                res.json(state);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching league state for kiosk');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // PRIZE POOL LEDGER
        // =====================================================
        this.getPrizePoolSummary = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const summary = yield this.leagueService.getPrizePoolSummary(req.params.leagueId);
                res.json(summary);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching prize pool summary');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getPlayerPrizeHistory = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const history = yield this.leagueService.getPlayerPrizeHistory(req.params.leagueId, req.params.playerId);
                res.json(history);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching player prize history');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.confirmWeekPayouts = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.confirmWeekPayouts(req.params.leagueId, req.params.weekId, confirmedBy);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error confirming week payouts');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.confirmSinglePayout = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.confirmPayout(req.params.entryId, confirmedBy);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error confirming payout');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // TEAM MANAGEMENT
        // =====================================================
        this.createTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const captainUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { teamName } = req.body;
                if (!captainUserId || !teamName) {
                    return res.status(400).json({ error: 'teamName is required' });
                }
                const team = yield this.leagueService.createTeam(req.params.leagueId, captainUserId, teamName);
                res.status(201).json(team);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error creating team');
                if (error.message.includes('already on a team') || error.message.includes('already exists')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('does not support') || error.message.includes('not accepting')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getTeams = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const teams = yield this.leagueService.getTeams(req.params.leagueId);
                res.json(teams);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching teams');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const team = yield this.leagueService.getTeam(req.params.teamId);
                res.json(team);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching team');
                res.status(404).json({ error: error.message });
            }
        });
        this.inviteTeammates = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const captainUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { emails } = req.body;
                if (!emails || !Array.isArray(emails) || emails.length === 0) {
                    return res.status(400).json({ error: 'emails array is required' });
                }
                if (!captainUserId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                const result = yield this.leagueService.inviteTeammates(req.params.teamId, captainUserId, emails);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error inviting teammates');
                if (error.message.includes('Only the team captain') || error.message.includes('no longer accepting')) {
                    return res.status(403).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getInviteByToken = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const invite = yield this.leagueService.getInviteByToken(req.params.token);
                res.json(invite);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching invite');
                res.status(404).json({ error: error.message });
            }
        });
        this.acceptInvite = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                const result = yield this.leagueService.acceptInvite(req.params.token, userId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error accepting invite');
                if (error.message.includes('not sent to you') || error.message.includes('already been')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.declineInvite = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                yield this.leagueService.declineInvite(req.params.token, userId);
                res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error declining invite');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.enrollTeamPlayer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { displayName, initialHandicap } = req.body;
                if (!userId || !displayName) {
                    return res.status(400).json({ error: 'displayName is required' });
                }
                const result = yield this.leagueService.enrollTeamPlayer(req.params.leagueId, req.params.teamId, userId, displayName, typeof initialHandicap === 'number' ? initialHandicap : 0);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in team enroll-and-pay');
                if (error.message.includes('already paid')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('does not support') || error.message.includes('cannot accept')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.disqualifyTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { reason } = req.body;
                const result = yield this.leagueService.disqualifyTeam(req.params.teamId, reason || 'Disqualified by employee');
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error disqualifying team');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getUserTeams = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied: can only view your own teams' });
                }
                const teams = yield this.leagueService.getUserTeams(userId);
                res.json(teams);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching user teams');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // =====================================================
        // ATTENDANCE CONFIRMATION
        // =====================================================
        /**
         * Token-based confirm (from email link, no auth required)
         */
        this.confirmAttendanceByToken = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { token } = req.params;
                const result = yield this.attendanceService.confirmAttendance(token);
                if (!result.success) {
                    return res.status(400).json({ error: result.message });
                }
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error confirming attendance');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Token-based decline (from email link, no auth required)
         */
        this.declineAttendanceByToken = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { token } = req.params;
                const result = yield this.attendanceService.declineAttendance(token);
                if (!result.success) {
                    return res.status(400).json({ error: result.message });
                }
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error declining attendance');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Get attendance list for a week (employee view)
         */
        this.getWeekAttendance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { weekId } = req.params;
                const attendance = yield this.attendanceService.getAttendanceForWeek(weekId);
                res.json(attendance);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching week attendance');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Get attendance summary for a week
         */
        this.getWeekAttendanceSummary = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId, weekId } = req.params;
                // Get players_per_space from league
                const league = yield this.leagueService.getLeague(leagueId);
                const playersPerSpace = (league === null || league === void 0 ? void 0 : league.players_per_space) || 2;
                const summary = yield this.attendanceService.getAttendanceSummary(weekId, playersPerSpace);
                res.json(summary);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching attendance summary');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Update own attendance (auth-based, from user dashboard)
         */
        this.updateAttendance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { leagueId, weekId } = req.params;
                const { status } = req.body;
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!status) {
                    return res.status(400).json({ error: 'status is required' });
                }
                if (!['confirmed', 'declined'].includes(status)) {
                    return res.status(400).json({ error: 'Status must be "confirmed" or "declined"' });
                }
                // Look up the player record by authenticated userId + leagueId
                const playerId = yield this.leagueService.getActivePlayerIdForUser(userId, leagueId);
                if (!playerId) {
                    return res.status(404).json({ error: 'You are not enrolled in this league' });
                }
                const attendance = yield this.attendanceService.updateAttendance(playerId, weekId, status);
                res.json(attendance);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error updating attendance');
                if (error.message.includes('locked') || error.message.includes('not found')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Get all my attendance statuses across weeks for a league
         */
        this.getPlayerAttendance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId, userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                const attendance = yield this.attendanceService.getPlayerAttendance(userId, leagueId);
                res.json(attendance);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching player attendance (employee)');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.getMyAttendance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { leagueId } = req.params;
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (!userId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                const attendance = yield this.attendanceService.getPlayerAttendance(userId, leagueId);
                res.json(attendance);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching player attendance');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Employee: manually trigger capacity adjustment for a week
         */
        this.manualAdjustCapacity = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId, weekId } = req.params;
                const result = yield this.attendanceService.adjustCapacityHold(leagueId, weekId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error adjusting capacity');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Get all capacity holds for a league (schedule view)
         */
        this.getLeagueHolds = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId } = req.params;
                const holds = yield this.capacityHoldService.getHoldsForLeague(leagueId);
                res.json(holds);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching league holds');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Employee: skip a week (holiday) — suspends the capacity hold for that week
         */
        this.skipWeek = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId, weekId } = req.params;
                // Find the capacity hold for this week
                const holds = yield this.capacityHoldService.getHoldsForLeague(leagueId);
                const weekHold = holds.find(h => h.league_week_id === weekId && h.status === 'active');
                if (!weekHold) {
                    return res.status(404).json({ error: 'No active hold found for this week' });
                }
                yield this.capacityHoldService.suspendHold(weekHold.id);
                res.json({ success: true, message: 'Week skipped — hold suspended and spaces released.' });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error skipping week');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        /**
         * Employee: unskip a week — reactivates the capacity hold for that week
         */
        this.unskipWeek = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId, weekId } = req.params;
                // Find the suspended hold for this week
                const holds = yield this.capacityHoldService.getHoldsForLeague(leagueId);
                const weekHold = holds.find(h => h.league_week_id === weekId && h.status === 'suspended');
                if (!weekHold) {
                    return res.status(404).json({ error: 'No suspended hold found for this week' });
                }
                yield this.capacityHoldService.activateHold(weekHold.id);
                res.json({ success: true, message: 'Week restored — hold reactivated.' });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error unskipping week');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.leagueService = new league_service_1.LeagueService();
        this.attendanceService = new attendance_service_1.AttendanceService();
        this.capacityHoldService = new capacity_hold_service_1.CapacityHoldService();
        this.socketService = socketService;
    }
}
exports.LeagueController = LeagueController;
