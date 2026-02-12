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
                console.error('Error creating league:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error fetching leagues:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.getLeague(req.params.leagueId);
                res.json(league);
            }
            catch (error) {
                console.error('Error fetching league:', error);
                res.status(404).json({ error: error.message });
            }
        });
        this.updateLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.updateLeague(req.params.leagueId, req.body);
                res.json(league);
            }
            catch (error) {
                console.error('Error updating league:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.activateLeague = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const league = yield this.leagueService.activateLeague(req.params.leagueId);
                res.json(league);
            }
            catch (error) {
                console.error('Error activating league:', error);
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
                console.error('Error adding course:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getCourses = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const courses = yield this.leagueService.getCourses(req.params.leagueId);
                res.json(courses);
            }
            catch (error) {
                console.error('Error fetching courses:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.updateCourse = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const course = yield this.leagueService.updateCourse(req.params.courseId, req.body);
                res.json(course);
            }
            catch (error) {
                console.error('Error updating course:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.deleteCourse = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.leagueService.deleteCourse(req.params.courseId);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error deleting course:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error assigning course to week:', error);
                res.status(500).json({ error: error.message });
            }
        });
        // =====================================================
        // PLAYER ENROLLMENT
        // =====================================================
        this.enrollPlayer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const player = yield this.leagueService.enrollPlayer(req.params.leagueId, req.body);
                res.status(201).json(player);
            }
            catch (error) {
                console.error('Error enrolling player:', error);
                if (error.message.includes('already enrolled')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('full')) {
                    return res.status(409).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        this.getPlayers = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const players = yield this.leagueService.getPlayers(req.params.leagueId);
                res.json(players);
            }
            catch (error) {
                console.error('Error fetching players:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.withdrawPlayer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.leagueService.withdrawPlayer(req.params.leagueId, req.params.playerId);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error withdrawing player:', error);
                res.status(500).json({ error: error.message });
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
                const overriddenBy = ((_a = req.employee) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.overrideHandicap(req.params.leagueId, req.params.playerId, handicap, overriddenBy, reason);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error overriding handicap:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error fetching weeks:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.activateWeek = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const week = yield this.leagueService.activateWeek(req.params.leagueId, req.params.weekId);
                res.json(week);
            }
            catch (error) {
                console.error('Error activating week:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error finalizing week:', error);
                res.status(500).json({ error: error.message });
            }
        });
        // =====================================================
        // SCORE ENTRY
        // =====================================================
        this.submitScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.leagueService.submitScore(req.body);
                // Get player info for the broadcast payload
                const league = yield this.leagueService.getLeague(req.params.leagueId);
                const players = yield this.leagueService.getPlayers(req.params.leagueId);
                const player = players.find(p => p.id === req.body.leaguePlayerId);
                // Broadcast score update via Socket.io
                if (player) {
                    const payload = {
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
            }
            catch (error) {
                console.error('Error submitting score:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getWeekScores = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const scores = yield this.leagueService.getWeekScores(req.params.leagueId, req.params.weekId);
                res.json(scores);
            }
            catch (error) {
                console.error('Error fetching week scores:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getPlayerScorecard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const scorecard = yield this.leagueService.getPlayerScorecard(req.params.leagueId, req.params.weekId, req.params.playerId);
                res.json(scorecard);
            }
            catch (error) {
                console.error('Error fetching player scorecard:', error);
                res.status(500).json({ error: error.message });
            }
        });
        // =====================================================
        // SCORE AUDITABILITY — CONFIRM / OVERRIDE
        // =====================================================
        this.confirmScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employee) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.confirmScore(req.params.scoreId, confirmedBy);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error confirming score:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.confirmWeekScores = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employee) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                const count = yield this.leagueService.confirmWeekScores(req.params.weekId, confirmedBy);
                res.json({ success: true, confirmed: count });
            }
            catch (error) {
                console.error('Error confirming week scores:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.overrideScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { strokes, reason } = req.body;
                if (strokes === undefined || !reason) {
                    return res.status(400).json({ error: 'strokes and reason are required' });
                }
                const overriddenBy = ((_a = req.employee) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.overrideScore(req.params.scoreId, strokes, overriddenBy, reason);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error overriding score:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error fetching standings:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getLiveLeaderboard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const leaderboard = yield this.leagueService.getLiveLeaderboard(req.params.leagueId);
                res.json(leaderboard);
            }
            catch (error) {
                console.error('Error fetching live leaderboard:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getTeamLeaderboard = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const leaderboard = yield this.leagueService.getTeamLeaderboard(req.params.leagueId);
                res.json(leaderboard);
            }
            catch (error) {
                console.error('Error fetching team leaderboard:', error);
                res.status(500).json({ error: error.message });
            }
        });
        // =====================================================
        // PAYMENT
        // =====================================================
        this.enrollAndPay = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId, displayName } = req.body;
                if (!userId || !displayName) {
                    return res.status(400).json({ error: 'userId and displayName are required' });
                }
                const result = yield this.leagueService.enrollAndPay(req.params.leagueId, userId, displayName);
                res.json(result);
            }
            catch (error) {
                console.error('Error in enroll-and-pay:', error);
                if (error.message.includes('already enrolled') || error.message.includes('full')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('not accepting')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        // =====================================================
        // USER-FACING: My Leagues
        // =====================================================
        this.getUserLeagues = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                const leagues = yield this.leagueService.getLeaguesForUser(userId);
                res.json(leagues);
            }
            catch (error) {
                console.error('Error fetching user leagues:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error fetching league state for kiosk:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error fetching prize pool summary:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getPlayerPrizeHistory = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const history = yield this.leagueService.getPlayerPrizeHistory(req.params.leagueId, req.params.playerId);
                res.json(history);
            }
            catch (error) {
                console.error('Error fetching player prize history:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.confirmWeekPayouts = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employee) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.confirmWeekPayouts(req.params.leagueId, req.params.weekId, confirmedBy);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error confirming week payouts:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.confirmSinglePayout = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const confirmedBy = ((_a = req.employee) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                yield this.leagueService.confirmPayout(req.params.entryId, confirmedBy);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error confirming payout:', error);
                res.status(500).json({ error: error.message });
            }
        });
        // =====================================================
        // TEAM MANAGEMENT
        // =====================================================
        this.createTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { captainUserId, teamName } = req.body;
                if (!captainUserId || !teamName) {
                    return res.status(400).json({ error: 'captainUserId and teamName are required' });
                }
                const team = yield this.leagueService.createTeam(req.params.leagueId, captainUserId, teamName);
                res.status(201).json(team);
            }
            catch (error) {
                console.error('Error creating team:', error);
                if (error.message.includes('already on a team') || error.message.includes('already exists')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('does not support') || error.message.includes('not accepting')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        this.getTeams = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const teams = yield this.leagueService.getTeams(req.params.leagueId);
                res.json(teams);
            }
            catch (error) {
                console.error('Error fetching teams:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const team = yield this.leagueService.getTeam(req.params.teamId);
                res.json(team);
            }
            catch (error) {
                console.error('Error fetching team:', error);
                res.status(404).json({ error: error.message });
            }
        });
        this.inviteTeammates = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { emails, captainUserId } = req.body;
                if (!emails || !Array.isArray(emails) || emails.length === 0) {
                    return res.status(400).json({ error: 'emails array is required' });
                }
                if (!captainUserId) {
                    return res.status(400).json({ error: 'captainUserId is required' });
                }
                const result = yield this.leagueService.inviteTeammates(req.params.teamId, captainUserId, emails);
                res.json(result);
            }
            catch (error) {
                console.error('Error inviting teammates:', error);
                if (error.message.includes('Only the team captain') || error.message.includes('no longer accepting')) {
                    return res.status(403).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        this.getInviteByToken = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const invite = yield this.leagueService.getInviteByToken(req.params.token);
                res.json(invite);
            }
            catch (error) {
                console.error('Error fetching invite:', error);
                res.status(404).json({ error: error.message });
            }
        });
        this.acceptInvite = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.body;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                const result = yield this.leagueService.acceptInvite(req.params.token, userId);
                res.json(result);
            }
            catch (error) {
                console.error('Error accepting invite:', error);
                if (error.message.includes('not sent to you') || error.message.includes('already been')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        this.declineInvite = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.body;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                yield this.leagueService.declineInvite(req.params.token, userId);
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error declining invite:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.enrollTeamPlayer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId, displayName } = req.body;
                if (!userId || !displayName) {
                    return res.status(400).json({ error: 'userId and displayName are required' });
                }
                const result = yield this.leagueService.enrollTeamPlayer(req.params.leagueId, req.params.teamId, userId, displayName);
                res.json(result);
            }
            catch (error) {
                console.error('Error in team enroll-and-pay:', error);
                if (error.message.includes('already paid')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('does not support') || error.message.includes('cannot accept')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        this.disqualifyTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { reason } = req.body;
                const result = yield this.leagueService.disqualifyTeam(req.params.teamId, reason || 'Disqualified by employee');
                res.json(result);
            }
            catch (error) {
                console.error('Error disqualifying team:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.getUserTeams = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }
                const teams = yield this.leagueService.getUserTeams(userId);
                res.json(teams);
            }
            catch (error) {
                console.error('Error fetching user teams:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error confirming attendance:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error declining attendance:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error fetching week attendance:', error);
                res.status(500).json({ error: error.message });
            }
        });
        /**
         * Get attendance summary for a week
         */
        this.getWeekAttendanceSummary = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId, weekId } = req.params;
                // Get players_per_bay from league
                const league = yield this.leagueService.getLeague(leagueId);
                const playersPerBay = (league === null || league === void 0 ? void 0 : league.players_per_bay) || 2;
                const summary = yield this.attendanceService.getAttendanceSummary(weekId, playersPerBay);
                res.json(summary);
            }
            catch (error) {
                console.error('Error fetching attendance summary:', error);
                res.status(500).json({ error: error.message });
            }
        });
        /**
         * Update own attendance (auth-based, from user dashboard)
         */
        this.updateAttendance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { weekId } = req.params;
                const { status, leaguePlayerId } = req.body;
                if (!leaguePlayerId || !status) {
                    return res.status(400).json({ error: 'leaguePlayerId and status are required' });
                }
                if (!['confirmed', 'declined'].includes(status)) {
                    return res.status(400).json({ error: 'Status must be "confirmed" or "declined"' });
                }
                const attendance = yield this.attendanceService.updateAttendance(leaguePlayerId, weekId, status);
                res.json(attendance);
            }
            catch (error) {
                console.error('Error updating attendance:', error);
                if (error.message.includes('locked') || error.message.includes('not found')) {
                    return res.status(400).json({ error: error.message });
                }
                res.status(500).json({ error: error.message });
            }
        });
        /**
         * Get all my attendance statuses across weeks for a league
         */
        this.getMyAttendance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { leagueId } = req.params;
                const userId = req.query.userId;
                if (!userId) {
                    return res.status(400).json({ error: 'userId query param is required' });
                }
                const attendance = yield this.attendanceService.getPlayerAttendance(userId, leagueId);
                res.json(attendance);
            }
            catch (error) {
                console.error('Error fetching player attendance:', error);
                res.status(500).json({ error: error.message });
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
                console.error('Error adjusting capacity:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.leagueService = new league_service_1.LeagueService();
        this.attendanceService = new attendance_service_1.AttendanceService();
        this.socketService = socketService;
    }
}
exports.LeagueController = LeagueController;
