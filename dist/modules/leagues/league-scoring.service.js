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
exports.LeagueScoringService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const handicap_utils_1 = require("./handicap.utils");
class LeagueScoringService {
    constructor(standingsService, prizeService, courseService) {
        this.standingsService = standingsService;
        this.prizeService = prizeService;
        this.courseService = courseService;
    }
    getLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('id', leagueId)
                .is('deleted_at', null)
                .single();
            if (error || !data)
                throw new Error(`League not found: ${error === null || error === void 0 ? void 0 : error.message}`);
            return data;
        });
    }
    getWeeks(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_weeks')
                .select('*')
                .eq('league_id', leagueId)
                .order('week_number');
            if (error) {
                throw new Error(`Failed to fetch weeks: ${error.message}`);
            }
            return data || [];
        });
    }
    activateWeek(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Set the week to 'active'
            const { data, error } = yield database_1.supabase
                .from('league_weeks')
                .update({ status: 'active' })
                .eq('id', weekId)
                .eq('league_id', leagueId)
                .select()
                .single();
            if (error || !data) {
                throw new Error(`Failed to activate week: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Update current_week on the league
            yield database_1.supabase
                .from('leagues')
                .update({ current_week: data.week_number })
                .eq('id', leagueId);
            return data;
        });
    }
    finalizeWeek(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Recalculate standings first (before marking as finalized)
            yield this.standingsService.recalculateStandings(leagueId);
            const league = yield this.getLeague(leagueId);
            // Recalculate handicaps
            if (league.handicap_enabled) {
                yield this.standingsService.recalculateHandicaps(leagueId, weekId);
            }
            // For team leagues, also calculate team scores for this week
            if (league.format === 'team') {
                try {
                    yield this.standingsService.recalculateTeamStandings(leagueId);
                }
                catch (teamError) {
                    logger_1.logger.error({ err: teamError }, 'Error recalculating team standings');
                }
            }
            // Generate weekly prize payouts if prize pool is enabled
            let payouts;
            const prizeConfig = league.prize_pool_config;
            if ((prizeConfig === null || prizeConfig === void 0 ? void 0 : prizeConfig.enabled) && prizeConfig.buyInPerSession > 0) {
                try {
                    payouts = yield this.prizeService.generateWeekPayouts(leagueId, weekId);
                }
                catch (payoutError) {
                    logger_1.logger.error({ err: payoutError, weekId }, 'Error generating payouts for week');
                }
            }
            // Mark week as finalized LAST — after all dependent operations succeed
            const { error: weekError } = yield database_1.supabase
                .from('league_weeks')
                .update({ status: 'finalized' })
                .eq('id', weekId)
                .eq('league_id', leagueId);
            if (weekError) {
                throw new Error(`Failed to finalize week: ${weekError.message}`);
            }
            const standings = yield this.standingsService.getStandings(leagueId);
            return { standings, payouts };
        });
    }
    validateScoreSubmission(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { leagueWeekId, leaguePlayerId, holeNumber, strokes } = data;
            if (!leagueWeekId || !leaguePlayerId || !holeNumber || strokes === undefined) {
                throw new Error('Missing required fields: leagueWeekId, leaguePlayerId, holeNumber, strokes');
            }
            if (!Number.isInteger(strokes) || strokes < 1 || strokes > 20) {
                throw new Error('Strokes must be an integer between 1 and 20');
            }
            if (!Number.isInteger(holeNumber) || holeNumber < 1) {
                throw new Error('Hole number must be a positive integer');
            }
            const { data: week, error: weekError } = yield database_1.supabase
                .from('league_weeks')
                .select('id, status, league_id')
                .eq('id', leagueWeekId)
                .single();
            if (weekError || !week) {
                throw new Error('Week not found');
            }
            if (week.status !== 'active') {
                throw new Error(`Cannot submit scores for a week with status '${week.status}'. Week must be active.`);
            }
            const league = yield this.getLeague(week.league_id);
            if (holeNumber > league.num_holes) {
                throw new Error(`Hole number ${holeNumber} exceeds league hole count (${league.num_holes})`);
            }
            const { data: player, error: playerError } = yield database_1.supabase
                .from('league_players')
                .select('id, enrollment_status')
                .eq('id', leaguePlayerId)
                .single();
            if (playerError || !player) {
                throw new Error('Player not found');
            }
            if (player.enrollment_status !== 'active') {
                throw new Error(`Player enrollment status is '${player.enrollment_status}'. Must be active to submit scores.`);
            }
        });
    }
    submitScore(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { leagueWeekId, leaguePlayerId, holeNumber, strokes, bayId, enteredVia = 'kiosk' } = data;
            yield this.validateScoreSubmission(data);
            const { data: result, error } = yield database_1.supabase.rpc('submit_league_score', {
                p_league_week_id: leagueWeekId,
                p_league_player_id: leaguePlayerId,
                p_hole_number: holeNumber,
                p_strokes: strokes,
                p_bay_id: bayId || null,
                p_entered_via: enteredVia,
            });
            if (error || !result) {
                throw new Error(`Failed to submit score: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return result;
        });
    }
    submitScoresBulk(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { leagueWeekId, leaguePlayerId, scores, enteredVia = 'employee' } = data;
            // Validate player and week status
            yield this.validateScoreSubmission({ leagueWeekId, leaguePlayerId, holeNumber: 1, strokes: 1 });
            // Validate each score entry
            const league = yield this.getLeague(leagueId);
            for (const { holeNumber, strokes } of scores) {
                if (!holeNumber || holeNumber < 1 || holeNumber > league.num_holes) {
                    throw new Error(`Invalid hole number: ${holeNumber}. Must be 1-${league.num_holes}`);
                }
                if (!strokes || !Number.isInteger(strokes) || strokes < 1 || strokes > 20) {
                    throw new Error(`Invalid strokes for hole ${holeNumber}: must be 1-20`);
                }
            }
            let lastResult = null;
            for (const { holeNumber, strokes } of scores) {
                const { data: result, error } = yield database_1.supabase.rpc('submit_league_score', {
                    p_league_week_id: leagueWeekId,
                    p_league_player_id: leaguePlayerId,
                    p_hole_number: holeNumber,
                    p_strokes: strokes,
                    p_bay_id: null,
                    p_entered_via: enteredVia,
                });
                if (error) {
                    throw new Error(`Failed to submit score for hole ${holeNumber}: ${error.message}`);
                }
                if (result)
                    lastResult = result;
            }
            return lastResult || { score_id: '', league_id: leagueId, holes_entered: scores.length, total_holes: scores.length, round_gross: 0, round_complete: false };
        });
    }
    getWeekScores(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_scores')
                .select('*, league_players(display_name, current_handicap)')
                .eq('league_week_id', weekId)
                .order('league_player_id')
                .order('hole_number');
            if (error) {
                throw new Error(`Failed to fetch week scores: ${error.message}`);
            }
            return data || [];
        });
    }
    getPlayerScorecard(leagueId, weekId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: scores, error } = yield database_1.supabase
                .from('league_scores')
                .select('hole_number, strokes, entered_via, score_status, created_at')
                .eq('league_week_id', weekId)
                .eq('league_player_id', playerId)
                .order('hole_number');
            if (error) {
                throw new Error(`Failed to fetch scorecard: ${error.message}`);
            }
            const { data: player } = yield database_1.supabase
                .from('league_players')
                .select('display_name, current_handicap')
                .eq('id', playerId)
                .single();
            const league = yield this.getLeague(leagueId);
            // Try to get course par from the week's assigned course
            const course = yield this.courseService.getCourseForWeek(weekId, league);
            const totalPar = (course === null || course === void 0 ? void 0 : course.total_par) || (league.num_holes * league.par_per_hole);
            const totalGross = (scores || []).reduce((sum, s) => sum + s.strokes, 0);
            const netScore = (0, handicap_utils_1.calculateNetScore)(totalGross, (player === null || player === void 0 ? void 0 : player.current_handicap) || 0);
            return {
                player: player === null || player === void 0 ? void 0 : player.display_name,
                handicap: (player === null || player === void 0 ? void 0 : player.current_handicap) || 0,
                scores: scores || [],
                totalGross,
                totalPar,
                netScore,
                holesCompleted: (scores || []).length,
                totalHoles: league.num_holes,
                courseName: (course === null || course === void 0 ? void 0 : course.course_name) || null,
                holePars: (course === null || course === void 0 ? void 0 : course.hole_pars) || null,
            };
        });
    }
    confirmScore(scoreId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_scores')
                .update({
                score_status: 'confirmed',
                confirmed_at: new Date().toISOString(),
                confirmed_by: confirmedBy,
            })
                .eq('id', scoreId);
            if (error) {
                throw new Error(`Failed to confirm score: ${error.message}`);
            }
        });
    }
    confirmWeekScores(weekId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_scores')
                .update({
                score_status: 'confirmed',
                confirmed_at: new Date().toISOString(),
                confirmed_by: confirmedBy,
            })
                .eq('league_week_id', weekId)
                .eq('score_status', 'submitted')
                .select('id');
            if (error) {
                throw new Error(`Failed to confirm week scores: ${error.message}`);
            }
            return (data || []).length;
        });
    }
    overrideScore(scoreId, newStrokes, overriddenBy, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_scores')
                .update({
                strokes: newStrokes,
                score_status: 'overridden',
                confirmed_at: new Date().toISOString(),
                confirmed_by: overriddenBy,
                override_reason: reason,
            })
                .eq('id', scoreId);
            if (error) {
                throw new Error(`Failed to override score: ${error.message}`);
            }
        });
    }
}
exports.LeagueScoringService = LeagueScoringService;
