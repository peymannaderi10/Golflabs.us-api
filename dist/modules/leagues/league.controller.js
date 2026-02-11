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
        this.leagueService = new league_service_1.LeagueService();
        this.socketService = socketService;
    }
}
exports.LeagueController = LeagueController;
