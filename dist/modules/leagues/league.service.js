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
exports.LeagueService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const handicap_utils_1 = require("./handicap.utils");
class LeagueService {
    // =====================================================
    // LEAGUE CRUD
    // =====================================================
    createLeague(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { locationId, name, format = 'stroke_play', numHoles = 9, parPerHole = 3, totalWeeks, dayOfWeek, startTime, endTime, seasonFee = 0, weeklyPrizePot = 0, maxPlayers = 32, handicapEnabled = true, startDate, } = data;
            // Insert the league
            const { data: league, error } = yield database_1.supabase
                .from('leagues')
                .insert({
                location_id: locationId,
                name,
                format,
                num_holes: numHoles,
                par_per_hole: parPerHole,
                total_weeks: totalWeeks,
                day_of_week: dayOfWeek,
                start_time: startTime,
                end_time: endTime,
                season_fee: seasonFee,
                weekly_prize_pot: weeklyPrizePot,
                max_players: maxPlayers,
                handicap_enabled: handicapEnabled,
            })
                .select()
                .single();
            if (error || !league) {
                throw new Error(`Failed to create league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Auto-generate league_weeks rows
            const weeks = [];
            const start = new Date(startDate);
            for (let i = 0; i < totalWeeks; i++) {
                const weekDate = new Date(start);
                weekDate.setDate(weekDate.getDate() + (i * 7));
                weeks.push({
                    league_id: league.id,
                    week_number: i + 1,
                    date: weekDate.toISOString().split('T')[0],
                    status: 'upcoming',
                });
            }
            const { error: weeksError } = yield database_1.supabase
                .from('league_weeks')
                .insert(weeks);
            if (weeksError) {
                console.error('Failed to create league weeks:', weeksError);
                // Non-fatal — league is still created
            }
            return league;
        });
    }
    getLeaguesByLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('location_id', locationId)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false });
            if (error) {
                throw new Error(`Failed to fetch leagues: ${error.message}`);
            }
            return data || [];
        });
    }
    getLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('id', leagueId)
                .single();
            if (error || !data) {
                throw new Error(`League not found: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    updateLeague(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateData = {};
            if (data.name !== undefined)
                updateData.name = data.name;
            if (data.format !== undefined)
                updateData.format = data.format;
            if (data.numHoles !== undefined)
                updateData.num_holes = data.numHoles;
            if (data.parPerHole !== undefined)
                updateData.par_per_hole = data.parPerHole;
            if (data.seasonFee !== undefined)
                updateData.season_fee = data.seasonFee;
            if (data.weeklyPrizePot !== undefined)
                updateData.weekly_prize_pot = data.weeklyPrizePot;
            if (data.maxPlayers !== undefined)
                updateData.max_players = data.maxPlayers;
            if (data.handicapEnabled !== undefined)
                updateData.handicap_enabled = data.handicapEnabled;
            if (data.startTime !== undefined)
                updateData.start_time = data.startTime;
            if (data.endTime !== undefined)
                updateData.end_time = data.endTime;
            const { data: league, error } = yield database_1.supabase
                .from('leagues')
                .update(updateData)
                .eq('id', leagueId)
                .select()
                .single();
            if (error || !league) {
                throw new Error(`Failed to update league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return league;
        });
    }
    activateLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.status !== 'draft' && league.status !== 'registration') {
                throw new Error(`Cannot activate league in '${league.status}' status`);
            }
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .update({ status: 'active', current_week: 1 })
                .eq('id', leagueId)
                .select()
                .single();
            if (error || !data) {
                throw new Error(`Failed to activate league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    // =====================================================
    // PLAYER ENROLLMENT
    // =====================================================
    enrollPlayer(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Check capacity
            const { count, error: countError } = yield database_1.supabase
                .from('league_players')
                .select('*', { count: 'exact', head: true })
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn');
            if (countError) {
                throw new Error(`Failed to check player count: ${countError.message}`);
            }
            if (count !== null && count >= league.max_players) {
                throw new Error('League is full');
            }
            // Insert player
            const { data: player, error } = yield database_1.supabase
                .from('league_players')
                .insert({
                league_id: leagueId,
                user_id: data.userId,
                display_name: data.displayName,
                enrollment_status: 'active',
            })
                .select()
                .single();
            if (error || !player) {
                if ((error === null || error === void 0 ? void 0 : error.code) === '23505') {
                    throw new Error('Player is already enrolled in this league');
                }
                throw new Error(`Failed to enroll player: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Create initial standings row
            const { error: standingsError } = yield database_1.supabase
                .from('league_standings')
                .insert({
                league_id: leagueId,
                league_player_id: player.id,
            });
            if (standingsError) {
                console.error('Failed to create standings row:', standingsError);
            }
            return player;
        });
    }
    getPlayers(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_players')
                .select('*, user_profiles(email)')
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn')
                .order('display_name');
            if (error) {
                throw new Error(`Failed to fetch players: ${error.message}`);
            }
            return (data || []).map((p) => {
                var _a;
                return (Object.assign(Object.assign({}, p), { email: (_a = p.user_profiles) === null || _a === void 0 ? void 0 : _a.email, user_profiles: undefined }));
            });
        });
    }
    withdrawPlayer(leagueId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_players')
                .update({ enrollment_status: 'withdrawn' })
                .eq('id', playerId)
                .eq('league_id', leagueId);
            if (error) {
                throw new Error(`Failed to withdraw player: ${error.message}`);
            }
        });
    }
    // =====================================================
    // WEEKLY SESSIONS
    // =====================================================
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
            // Set week status to 'finalized'
            const { error: weekError } = yield database_1.supabase
                .from('league_weeks')
                .update({ status: 'finalized' })
                .eq('id', weekId)
                .eq('league_id', leagueId);
            if (weekError) {
                throw new Error(`Failed to finalize week: ${weekError.message}`);
            }
            // Recalculate standings
            yield this.recalculateStandings(leagueId);
            // Recalculate handicaps
            const league = yield this.getLeague(leagueId);
            if (league.handicap_enabled) {
                yield this.recalculateHandicaps(leagueId, weekId);
            }
            // Return updated standings
            const standings = yield this.getStandings(leagueId);
            return { standings };
        });
    }
    // =====================================================
    // SCORE ENTRY
    // =====================================================
    submitScore(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { leagueWeekId, leaguePlayerId, holeNumber, strokes, bayId, enteredVia = 'kiosk' } = data;
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
                .select('hole_number, strokes, entered_via, created_at')
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
            const { data: league } = yield database_1.supabase
                .from('leagues')
                .select('num_holes, par_per_hole')
                .eq('id', leagueId)
                .single();
            const totalGross = (scores || []).reduce((sum, s) => sum + s.strokes, 0);
            const totalPar = ((league === null || league === void 0 ? void 0 : league.num_holes) || 9) * ((league === null || league === void 0 ? void 0 : league.par_per_hole) || 3);
            const netScore = (0, handicap_utils_1.calculateNetScore)(totalGross, (player === null || player === void 0 ? void 0 : player.current_handicap) || 0);
            return {
                player: player === null || player === void 0 ? void 0 : player.display_name,
                handicap: (player === null || player === void 0 ? void 0 : player.current_handicap) || 0,
                scores: scores || [],
                totalGross,
                totalPar,
                netScore,
                holesCompleted: (scores || []).length,
                totalHoles: (league === null || league === void 0 ? void 0 : league.num_holes) || 9,
            };
        });
    }
    // =====================================================
    // STANDINGS & LEADERBOARD
    // =====================================================
    getStandings(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_standings')
                .select('*, league_players(display_name, current_handicap)')
                .eq('league_id', leagueId)
                .order('current_rank');
            if (error) {
                throw new Error(`Failed to fetch standings: ${error.message}`);
            }
            return (data || []).map((s) => {
                var _a, _b;
                return ({
                    rank: s.current_rank,
                    playerId: s.league_player_id,
                    displayName: ((_a = s.league_players) === null || _a === void 0 ? void 0 : _a.display_name) || 'Unknown',
                    handicap: ((_b = s.league_players) === null || _b === void 0 ? void 0 : _b.current_handicap) || 0,
                    weeksPlayed: s.weeks_played,
                    totalGross: s.total_gross,
                    totalNet: s.total_net,
                    avgGross: s.avg_gross,
                    bestGross: s.best_gross,
                    points: s.points,
                });
            });
        });
    }
    getLiveLeaderboard(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Get the current active or most recent finalized week
            const { data: activeWeek } = yield database_1.supabase
                .from('league_weeks')
                .select('*')
                .eq('league_id', leagueId)
                .in('status', ['active', 'scoring'])
                .order('week_number', { ascending: false })
                .limit(1)
                .single();
            // Get all active players
            const players = yield this.getPlayers(leagueId);
            // Get season standings
            const { data: standings } = yield database_1.supabase
                .from('league_standings')
                .select('*')
                .eq('league_id', leagueId);
            const standingsMap = new Map((standings || []).map((s) => [s.league_player_id, s]));
            // Get today's scores if there's an active week
            let todayScoresMap = new Map();
            if (activeWeek) {
                const { data: todayScores } = yield database_1.supabase
                    .from('league_scores')
                    .select('league_player_id, strokes')
                    .eq('league_week_id', activeWeek.id);
                // Aggregate scores by player
                const playerScores = new Map();
                (todayScores || []).forEach((s) => {
                    const existing = playerScores.get(s.league_player_id) || { gross: 0, holes: 0 };
                    existing.gross += s.strokes;
                    existing.holes += 1;
                    playerScores.set(s.league_player_id, existing);
                });
                playerScores.forEach((val, key) => {
                    todayScoresMap.set(key, { gross: val.gross, holesCompleted: val.holes });
                });
            }
            // Build leaderboard entries
            const entries = players.map((player) => {
                const standing = standingsMap.get(player.id);
                const today = todayScoresMap.get(player.id);
                return {
                    rank: (standing === null || standing === void 0 ? void 0 : standing.current_rank) || 0,
                    playerId: player.id,
                    displayName: player.display_name,
                    handicap: player.current_handicap,
                    todayGross: (today === null || today === void 0 ? void 0 : today.gross) || 0,
                    todayNet: today ? (0, handicap_utils_1.calculateNetScore)(today.gross, player.current_handicap) : 0,
                    thru: (today === null || today === void 0 ? void 0 : today.holesCompleted) || 0,
                    totalHoles: league.num_holes,
                    seasonGross: (standing === null || standing === void 0 ? void 0 : standing.total_gross) || 0,
                    seasonNet: (standing === null || standing === void 0 ? void 0 : standing.total_net) || 0,
                    weeksPlayed: (standing === null || standing === void 0 ? void 0 : standing.weeks_played) || 0,
                };
            });
            // Sort by today's net score (ascending), then by season rank
            entries.sort((a, b) => {
                // Players who have started today come first
                if (a.thru > 0 && b.thru === 0)
                    return -1;
                if (a.thru === 0 && b.thru > 0)
                    return 1;
                // Among players who have started, sort by net score
                if (a.thru > 0 && b.thru > 0) {
                    return a.todayNet - b.todayNet;
                }
                // Among players who haven't started, sort by season rank
                return a.rank - b.rank;
            });
            // Re-assign rank based on sorted order
            entries.forEach((entry, index) => {
                entry.rank = index + 1;
            });
            return entries;
        });
    }
    // =====================================================
    // STANDINGS RECALCULATION
    // =====================================================
    recalculateStandings(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Get all finalized weeks
            const { data: finalizedWeeks } = yield database_1.supabase
                .from('league_weeks')
                .select('id')
                .eq('league_id', leagueId)
                .eq('status', 'finalized');
            const weekIds = (finalizedWeeks || []).map((w) => w.id);
            if (weekIds.length === 0)
                return;
            // Get all scores for finalized weeks
            const { data: allScores } = yield database_1.supabase
                .from('league_scores')
                .select('league_week_id, league_player_id, strokes')
                .in('league_week_id', weekIds);
            // Get all players
            const { data: players } = yield database_1.supabase
                .from('league_players')
                .select('id, current_handicap')
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn');
            if (!players || !allScores)
                return;
            // Calculate per-player stats
            const playerStats = new Map();
            // Group scores by player and week
            const scoresByPlayerWeek = new Map();
            (allScores || []).forEach((score) => {
                const key = score.league_player_id;
                if (!scoresByPlayerWeek.has(key)) {
                    scoresByPlayerWeek.set(key, new Map());
                }
                const weekMap = scoresByPlayerWeek.get(key);
                const weekGross = (weekMap.get(score.league_week_id) || 0) + score.strokes;
                weekMap.set(score.league_week_id, weekGross);
            });
            // Now compute stats
            for (const player of players) {
                const weekMap = scoresByPlayerWeek.get(player.id);
                if (!weekMap || weekMap.size === 0) {
                    playerStats.set(player.id, {
                        weeksPlayed: 0,
                        totalGross: 0,
                        totalNet: 0,
                        bestGross: null,
                        roundGrosses: [],
                    });
                    continue;
                }
                const roundGrosses = [];
                let totalGross = 0;
                let bestGross = null;
                weekMap.forEach((gross) => {
                    roundGrosses.push(gross);
                    totalGross += gross;
                    if (bestGross === null || gross < bestGross) {
                        bestGross = gross;
                    }
                });
                const handicap = player.current_handicap || 0;
                const totalNet = totalGross - (handicap * weekMap.size);
                playerStats.set(player.id, {
                    weeksPlayed: weekMap.size,
                    totalGross,
                    totalNet: Math.round(totalNet * 10) / 10,
                    bestGross,
                    roundGrosses,
                });
            }
            // Sort players by total net for ranking
            const rankedPlayers = [...playerStats.entries()]
                .sort((a, b) => {
                // Players with no weeks come last
                if (a[1].weeksPlayed === 0 && b[1].weeksPlayed > 0)
                    return 1;
                if (a[1].weeksPlayed > 0 && b[1].weeksPlayed === 0)
                    return -1;
                return a[1].totalNet - b[1].totalNet;
            });
            // Update standings
            for (let i = 0; i < rankedPlayers.length; i++) {
                const [playerId, stats] = rankedPlayers[i];
                const avgGross = stats.weeksPlayed > 0
                    ? Math.round((stats.totalGross / stats.weeksPlayed) * 10) / 10
                    : 0;
                yield database_1.supabase
                    .from('league_standings')
                    .upsert({
                    league_id: leagueId,
                    league_player_id: playerId,
                    weeks_played: stats.weeksPlayed,
                    total_gross: stats.totalGross,
                    total_net: stats.totalNet,
                    best_gross: stats.bestGross,
                    avg_gross: avgGross,
                    current_rank: stats.weeksPlayed > 0 ? i + 1 : 0,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'league_id,league_player_id' });
            }
        });
    }
    // =====================================================
    // HANDICAP RECALCULATION
    // =====================================================
    recalculateHandicaps(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            const players = yield this.getPlayers(leagueId);
            // Get all finalized weeks in order
            const { data: finalizedWeeks } = yield database_1.supabase
                .from('league_weeks')
                .select('id')
                .eq('league_id', leagueId)
                .eq('status', 'finalized')
                .order('week_number');
            const weekIds = (finalizedWeeks || []).map((w) => w.id);
            if (weekIds.length === 0)
                return;
            for (const player of players) {
                // Get all scores for this player across finalized weeks
                const { data: scores } = yield database_1.supabase
                    .from('league_scores')
                    .select('league_week_id, strokes')
                    .eq('league_player_id', player.id)
                    .in('league_week_id', weekIds);
                if (!scores || scores.length === 0)
                    continue;
                // Group scores by week and compute round grosses
                const weekGrosses = new Map();
                scores.forEach((s) => {
                    weekGrosses.set(s.league_week_id, (weekGrosses.get(s.league_week_id) || 0) + s.strokes);
                });
                // Build differentials in week order
                const differentials = [];
                for (const wId of weekIds) {
                    const gross = weekGrosses.get(wId);
                    if (gross !== undefined) {
                        differentials.push((0, handicap_utils_1.calculateDifferential)(gross, league.num_holes, league.par_per_hole));
                    }
                }
                // Calculate new handicap
                const oldHandicap = player.current_handicap;
                const newHandicap = (0, handicap_utils_1.calculateHandicap)(differentials, league.handicap_rounds_used, league.handicap_rounds_window);
                // Update player handicap
                if (newHandicap !== oldHandicap) {
                    yield database_1.supabase
                        .from('league_players')
                        .update({ current_handicap: newHandicap })
                        .eq('id', player.id);
                    // Record history
                    yield database_1.supabase
                        .from('handicap_history')
                        .insert({
                        league_player_id: player.id,
                        league_week_id: weekId || null,
                        old_handicap: oldHandicap,
                        new_handicap: newHandicap,
                        calculation_details: {
                            differentials,
                            best_used: [...differentials].sort((a, b) => a - b).slice(0, league.handicap_rounds_used),
                            average: differentials.length > 0
                                ? differentials.reduce((a, b) => a + b, 0) / Math.min(differentials.length, league.handicap_rounds_used)
                                : 0,
                            multiplier: 0.96,
                        },
                    });
                }
            }
        });
    }
    // =====================================================
    // PAYMENT — ENROLL AND PAY
    // =====================================================
    enrollAndPay(leagueId, userId, displayName) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.status !== 'registration' && league.status !== 'active') {
                throw new Error('League is not accepting enrollments');
            }
            // Check capacity
            const { count } = yield database_1.supabase
                .from('league_players')
                .select('*', { count: 'exact', head: true })
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn');
            if (count !== null && count >= league.max_players) {
                throw new Error('League is full');
            }
            // Check if already enrolled
            const { data: existing } = yield database_1.supabase
                .from('league_players')
                .select('id, enrollment_status')
                .eq('league_id', leagueId)
                .eq('user_id', userId)
                .single();
            if (existing && existing.enrollment_status !== 'withdrawn') {
                throw new Error('Player is already enrolled in this league');
            }
            // Create pending player record
            const { data: player, error: playerError } = yield database_1.supabase
                .from('league_players')
                .upsert({
                league_id: leagueId,
                user_id: userId,
                display_name: displayName,
                enrollment_status: 'pending',
                season_paid: false,
                prize_pot_paid: false,
            }, { onConflict: 'league_id,user_id' })
                .select()
                .single();
            if (playerError || !player) {
                throw new Error(`Failed to create player record: ${playerError === null || playerError === void 0 ? void 0 : playerError.message}`);
            }
            // Calculate total amount
            const totalAmount = (league.season_fee + league.weekly_prize_pot) * 100; // cents
            if (totalAmount === 0) {
                // Free league — activate immediately
                yield database_1.supabase
                    .from('league_players')
                    .update({ enrollment_status: 'active', season_paid: true, prize_pot_paid: true })
                    .eq('id', player.id);
                yield database_1.supabase
                    .from('league_standings')
                    .upsert({ league_id: leagueId, league_player_id: player.id }, { onConflict: 'league_id,league_player_id' });
                return { clientSecret: '', playerId: player.id };
            }
            // Get or create Stripe customer
            const { data: userProfile } = yield database_1.supabase
                .from('user_profiles')
                .select('stripe_customer_id, email, full_name')
                .eq('id', userId)
                .single();
            let stripeCustomerId = userProfile === null || userProfile === void 0 ? void 0 : userProfile.stripe_customer_id;
            if (!stripeCustomerId) {
                const customer = yield stripe_1.stripe.customers.create({
                    email: userProfile === null || userProfile === void 0 ? void 0 : userProfile.email,
                    name: userProfile === null || userProfile === void 0 ? void 0 : userProfile.full_name,
                    metadata: { user_id: userId },
                });
                stripeCustomerId = customer.id;
                yield database_1.supabase
                    .from('user_profiles')
                    .update({ stripe_customer_id: stripeCustomerId })
                    .eq('id', userId);
            }
            // Create PaymentIntent
            const paymentIntent = yield stripe_1.stripe.paymentIntents.create({
                amount: totalAmount,
                currency: 'usd',
                customer: stripeCustomerId,
                automatic_payment_methods: { enabled: true },
                metadata: {
                    type: 'league_enrollment',
                    league_id: leagueId,
                    user_id: userId,
                    league_player_id: player.id,
                    season_fee: String(league.season_fee),
                    prize_pot: String(league.weekly_prize_pot),
                },
            });
            // Store payment intent ID on the player record
            yield database_1.supabase
                .from('league_players')
                .update({ stripe_payment_intent_id: paymentIntent.id })
                .eq('id', player.id);
            return {
                clientSecret: paymentIntent.client_secret,
                playerId: player.id,
            };
        });
    }
    // =====================================================
    // HELPER: Get league + player info for a kiosk
    // =====================================================
    // =====================================================
    // USER-FACING: Get all leagues a user is enrolled in
    // =====================================================
    getLeaguesForUser(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all league_players rows for this user (not withdrawn)
            const { data: enrollments, error } = yield database_1.supabase
                .from('league_players')
                .select('*, leagues(*)')
                .eq('user_id', userId)
                .neq('enrollment_status', 'withdrawn');
            if (error) {
                throw new Error(`Failed to fetch user leagues: ${error.message}`);
            }
            if (!enrollments || enrollments.length === 0) {
                return [];
            }
            const results = [];
            for (const enrollment of enrollments) {
                const league = enrollment.leagues;
                if (!league)
                    continue;
                // Get standing for this player in this league
                const { data: standing } = yield database_1.supabase
                    .from('league_standings')
                    .select('*')
                    .eq('league_id', league.id)
                    .eq('league_player_id', enrollment.id)
                    .single();
                // Get next upcoming or active week
                const { data: nextWeek } = yield database_1.supabase
                    .from('league_weeks')
                    .select('id, week_number, date, status')
                    .eq('league_id', league.id)
                    .in('status', ['upcoming', 'active'])
                    .order('week_number')
                    .limit(1)
                    .single();
                results.push({
                    league: {
                        id: league.id,
                        name: league.name,
                        format: league.format,
                        num_holes: league.num_holes,
                        par_per_hole: league.par_per_hole,
                        total_weeks: league.total_weeks,
                        current_week: league.current_week,
                        day_of_week: league.day_of_week,
                        start_time: league.start_time,
                        end_time: league.end_time,
                        season_fee: league.season_fee,
                        weekly_prize_pot: league.weekly_prize_pot,
                        max_players: league.max_players,
                        handicap_enabled: league.handicap_enabled,
                        status: league.status,
                        created_at: league.created_at,
                    },
                    player: {
                        id: enrollment.id,
                        displayName: enrollment.display_name,
                        handicap: enrollment.current_handicap,
                        enrollmentStatus: enrollment.enrollment_status,
                        seasonPaid: enrollment.season_paid,
                    },
                    standing: standing ? {
                        rank: standing.current_rank,
                        weeksPlayed: standing.weeks_played,
                        totalGross: standing.total_gross,
                        totalNet: standing.total_net,
                        avgGross: standing.avg_gross,
                        bestGross: standing.best_gross,
                    } : null,
                    nextWeek: nextWeek ? {
                        id: nextWeek.id,
                        weekNumber: nextWeek.week_number,
                        date: nextWeek.date,
                        status: nextWeek.status,
                    } : null,
                });
            }
            return results;
        });
    }
    // =====================================================
    // HELPER: Get league + player info for a kiosk
    // =====================================================
    getLeagueStateForKiosk(leagueId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Get current active week
            const { data: activeWeek } = yield database_1.supabase
                .from('league_weeks')
                .select('*')
                .eq('league_id', leagueId)
                .in('status', ['active', 'scoring'])
                .order('week_number', { ascending: false })
                .limit(1)
                .single();
            // Resolve player — by playerId directly, or look up by userId
            let player = null;
            if (options.playerId) {
                const { data } = yield database_1.supabase
                    .from('league_players')
                    .select('*')
                    .eq('id', options.playerId)
                    .single();
                player = data;
            }
            else if (options.userId) {
                const { data } = yield database_1.supabase
                    .from('league_players')
                    .select('*')
                    .eq('league_id', leagueId)
                    .eq('user_id', options.userId)
                    .neq('enrollment_status', 'withdrawn')
                    .single();
                player = data;
            }
            // Get player's scores for the active week
            let scores = [];
            let nextHole = 1;
            if (activeWeek) {
                const { data: weekScores } = yield database_1.supabase
                    .from('league_scores')
                    .select('hole_number, strokes')
                    .eq('league_week_id', activeWeek.id)
                    .eq('league_player_id', player.id)
                    .order('hole_number');
                scores = weekScores || [];
                nextHole = scores.length > 0
                    ? Math.max(...scores.map((s) => s.hole_number)) + 1
                    : 1;
            }
            return {
                league: {
                    id: league.id,
                    name: league.name,
                    numHoles: league.num_holes,
                    parPerHole: league.par_per_hole,
                    currentWeek: league.current_week,
                },
                week: activeWeek ? {
                    id: activeWeek.id,
                    weekNumber: activeWeek.week_number,
                    date: activeWeek.date,
                    status: activeWeek.status,
                } : null,
                player: player ? {
                    id: player.id,
                    displayName: player.display_name,
                    handicap: player.current_handicap,
                } : null,
                scores,
                nextHole: Math.min(nextHole, league.num_holes),
                roundComplete: player ? scores.length >= league.num_holes : false,
            };
        });
    }
}
exports.LeagueService = LeagueService;
