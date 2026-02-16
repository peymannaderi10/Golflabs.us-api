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
const email_service_1 = require("../email/email.service");
const capacity_hold_service_1 = require("../bookings/capacity-hold.service");
const handicap_utils_1 = require("./handicap.utils");
class LeagueService {
    constructor() {
        this.capacityHoldService = new capacity_hold_service_1.CapacityHoldService();
    }
    // =====================================================
    // LEAGUE CRUD
    // =====================================================
    createLeague(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { locationId, name, format = 'stroke_play', numHoles = 9, parPerHole = 3, totalWeeks, dayOfWeek, startTime, endTime, seasonFee = 0, weeklyPrizePot = 0, maxPlayers = 32, handicapEnabled = true, startDate, courseRotation = 'fixed', scoringType = 'net_stroke_play', pointsConfig, payoutConfig, courses, playersPerTeam = 2, teamScoringFormat = 'best_ball', capacityHoldType = 'all_bays', capacityHoldValue = 100, bufferBeforeMins = 0, bufferAfterMins = 0, attendanceRequired = false, attendanceAutoAdjust = false, attendanceReminderHours = 24, attendanceCutoffHours = 8, playersPerBay = 2, teamMinAttendance = null, } = data;
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
                course_rotation: courseRotation,
                scoring_type: scoringType,
                points_config: pointsConfig || null,
                payout_config: payoutConfig || { first_pct: 50, second_pct: 30, third_pct: 20, payout_method: 'weekly' },
                players_per_team: format === 'team' ? playersPerTeam : 2,
                team_scoring_format: format === 'team' ? teamScoringFormat : 'best_ball',
                capacity_hold_type: capacityHoldType,
                capacity_hold_value: capacityHoldValue,
                buffer_before_mins: bufferBeforeMins,
                buffer_after_mins: bufferAfterMins,
                attendance_required: attendanceRequired,
                attendance_auto_adjust: attendanceAutoAdjust,
                attendance_reminder_hours: attendanceReminderHours,
                attendance_cutoff_hours: attendanceCutoffHours,
                players_per_bay: playersPerBay,
                team_min_attendance: teamMinAttendance,
            })
                .select()
                .single();
            if (error || !league) {
                throw new Error(`Failed to create league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Create courses if provided
            let createdCourses = [];
            if (courses && courses.length > 0) {
                const courseRows = courses.map((c, idx) => ({
                    league_id: league.id,
                    course_name: c.courseName,
                    num_holes: c.numHoles,
                    hole_pars: c.holePars,
                    total_par: c.holePars.reduce((sum, p) => sum + p, 0),
                    is_default: idx === 0 ? true : (c.isDefault || false),
                }));
                const { data: coursesData, error: coursesError } = yield database_1.supabase
                    .from('league_courses')
                    .insert(courseRows)
                    .select();
                if (coursesError) {
                    console.error('Failed to create league courses:', coursesError);
                }
                else {
                    createdCourses = coursesData || [];
                }
            }
            // Auto-generate league_weeks rows
            const weeks = [];
            const start = new Date(startDate);
            for (let i = 0; i < totalWeeks; i++) {
                const weekDate = new Date(start);
                weekDate.setDate(weekDate.getDate() + (i * 7));
                // Assign course to week
                let courseId = null;
                if (createdCourses.length > 0) {
                    if (courseRotation === 'fixed') {
                        // Use the default course for all weeks
                        const defaultCourse = createdCourses.find(c => c.is_default) || createdCourses[0];
                        courseId = defaultCourse.id;
                    }
                    else {
                        // Rotating: round-robin through courses
                        courseId = createdCourses[i % createdCourses.length].id;
                    }
                }
                weeks.push({
                    league_id: league.id,
                    week_number: i + 1,
                    date: weekDate.toISOString().split('T')[0],
                    status: 'upcoming',
                    league_course_id: courseId,
                });
            }
            const { data: weeksData, error: weeksError } = yield database_1.supabase
                .from('league_weeks')
                .insert(weeks)
                .select('id, date');
            if (weeksError) {
                console.error('Failed to create league weeks:', weeksError);
                // Non-fatal — league is still created
            }
            // Generate capacity holds for each league week
            if (weeksData && weeksData.length > 0) {
                try {
                    yield this.capacityHoldService.generateHoldsForLeague(league.id, locationId, startTime, endTime, weeksData.map((w) => ({ id: w.id, date: w.date })), {
                        holdType: capacityHoldType,
                        holdValue: capacityHoldValue,
                        bufferBeforeMins,
                        bufferAfterMins,
                    });
                }
                catch (holdError) {
                    console.error('Failed to generate capacity holds:', holdError.message);
                    // Non-fatal — league is still created
                }
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
            if (data.courseRotation !== undefined)
                updateData.course_rotation = data.courseRotation;
            if (data.scoringType !== undefined)
                updateData.scoring_type = data.scoringType;
            if (data.pointsConfig !== undefined)
                updateData.points_config = data.pointsConfig;
            if (data.payoutConfig !== undefined)
                updateData.payout_config = data.payoutConfig;
            if (data.playersPerTeam !== undefined)
                updateData.players_per_team = data.playersPerTeam;
            if (data.teamScoringFormat !== undefined)
                updateData.team_scoring_format = data.teamScoringFormat;
            if (data.capacityHoldType !== undefined)
                updateData.capacity_hold_type = data.capacityHoldType;
            if (data.capacityHoldValue !== undefined)
                updateData.capacity_hold_value = data.capacityHoldValue;
            if (data.bufferBeforeMins !== undefined)
                updateData.buffer_before_mins = data.bufferBeforeMins;
            if (data.bufferAfterMins !== undefined)
                updateData.buffer_after_mins = data.bufferAfterMins;
            if (data.attendanceRequired !== undefined)
                updateData.attendance_required = data.attendanceRequired;
            if (data.attendanceAutoAdjust !== undefined)
                updateData.attendance_auto_adjust = data.attendanceAutoAdjust;
            if (data.attendanceReminderHours !== undefined)
                updateData.attendance_reminder_hours = data.attendanceReminderHours;
            if (data.attendanceCutoffHours !== undefined)
                updateData.attendance_cutoff_hours = data.attendanceCutoffHours;
            if (data.playersPerBay !== undefined)
                updateData.players_per_bay = data.playersPerBay;
            if (data.teamMinAttendance !== undefined)
                updateData.team_min_attendance = data.teamMinAttendance;
            const { data: league, error } = yield database_1.supabase
                .from('leagues')
                .update(updateData)
                .eq('id', leagueId)
                .select()
                .single();
            if (error || !league) {
                throw new Error(`Failed to update league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // If capacity hold config changed, update future holds
            if (data.capacityHoldType !== undefined || data.capacityHoldValue !== undefined ||
                data.bufferBeforeMins !== undefined || data.bufferAfterMins !== undefined) {
                try {
                    yield this.capacityHoldService.updateHoldConfig(leagueId, {
                        holdType: league.capacity_hold_type || 'all_bays',
                        holdValue: league.capacity_hold_value || 100,
                        bufferBeforeMins: league.buffer_before_mins || 0,
                        bufferAfterMins: league.buffer_after_mins || 0,
                    });
                }
                catch (holdError) {
                    console.error('Failed to update capacity holds:', holdError.message);
                }
            }
            return league;
        });
    }
    cancelLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: league, error } = yield database_1.supabase
                .from('leagues')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', leagueId)
                .select()
                .single();
            if (error || !league) {
                throw new Error(`Failed to cancel league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Release all capacity holds
            try {
                yield this.capacityHoldService.releaseHoldsForLeague(leagueId);
            }
            catch (holdError) {
                console.error('Failed to release capacity holds:', holdError.message);
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
    // COURSE MANAGEMENT
    // =====================================================
    addCourse(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const totalPar = data.holePars.reduce((sum, p) => sum + p, 0);
            const { data: course, error } = yield database_1.supabase
                .from('league_courses')
                .insert({
                league_id: leagueId,
                course_name: data.courseName,
                num_holes: data.numHoles,
                hole_pars: data.holePars,
                total_par: totalPar,
                is_default: data.isDefault || false,
            })
                .select()
                .single();
            if (error || !course) {
                throw new Error(`Failed to add course: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // If this is set as default, unset other defaults
            if (data.isDefault) {
                yield database_1.supabase
                    .from('league_courses')
                    .update({ is_default: false })
                    .eq('league_id', leagueId)
                    .neq('id', course.id);
            }
            return course;
        });
    }
    getCourses(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_courses')
                .select('*')
                .eq('league_id', leagueId)
                .order('is_default', { ascending: false })
                .order('created_at');
            if (error) {
                throw new Error(`Failed to fetch courses: ${error.message}`);
            }
            return data || [];
        });
    }
    updateCourse(courseId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateData = {};
            if (data.courseName !== undefined)
                updateData.course_name = data.courseName;
            if (data.holePars !== undefined) {
                updateData.hole_pars = data.holePars;
                updateData.total_par = data.holePars.reduce((sum, p) => sum + p, 0);
                updateData.num_holes = data.holePars.length;
            }
            if (data.isDefault !== undefined)
                updateData.is_default = data.isDefault;
            const { data: course, error } = yield database_1.supabase
                .from('league_courses')
                .update(updateData)
                .eq('id', courseId)
                .select()
                .single();
            if (error || !course) {
                throw new Error(`Failed to update course: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // If setting as default, unset others
            if (data.isDefault) {
                yield database_1.supabase
                    .from('league_courses')
                    .update({ is_default: false })
                    .eq('league_id', course.league_id)
                    .neq('id', course.id);
            }
            return course;
        });
    }
    deleteCourse(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_courses')
                .delete()
                .eq('id', courseId);
            if (error) {
                throw new Error(`Failed to delete course: ${error.message}`);
            }
        });
    }
    assignCourseToWeek(weekId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_weeks')
                .update({ league_course_id: courseId })
                .eq('id', weekId)
                .select()
                .single();
            if (error || !data) {
                throw new Error(`Failed to assign course to week: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    /**
     * Get the course for a specific week, falling back to league defaults.
     */
    getCourseForWeek(weekId, league) {
        return __awaiter(this, void 0, void 0, function* () {
            // First check if week has an assigned course
            const { data: week } = yield database_1.supabase
                .from('league_weeks')
                .select('league_course_id')
                .eq('id', weekId)
                .single();
            if (week === null || week === void 0 ? void 0 : week.league_course_id) {
                const { data: course } = yield database_1.supabase
                    .from('league_courses')
                    .select('*')
                    .eq('id', week.league_course_id)
                    .single();
                if (course)
                    return course;
            }
            // Fall back to default course for the league
            const { data: defaultCourse } = yield database_1.supabase
                .from('league_courses')
                .select('*')
                .eq('league_id', league.id)
                .eq('is_default', true)
                .single();
            return defaultCourse || null;
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
            // For team leagues, also calculate team scores for this week
            if (league.format === 'team') {
                try {
                    yield this.recalculateTeamStandings(leagueId);
                }
                catch (teamError) {
                    console.error(`Error recalculating team standings:`, teamError.message);
                }
            }
            // Generate weekly prize payouts if prize pot is configured
            let payouts;
            if (league.weekly_prize_pot > 0) {
                try {
                    payouts = yield this.generateWeekPayouts(leagueId, weekId);
                }
                catch (payoutError) {
                    console.error(`Error generating payouts for week ${weekId}:`, payoutError.message);
                    // Don't fail the whole finalize if payout generation fails
                }
            }
            // Return updated standings
            const standings = yield this.getStandings(leagueId);
            return { standings, payouts };
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
            const course = yield this.getCourseForWeek(weekId, league);
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
    // =====================================================
    // STANDINGS & LEADERBOARD
    // =====================================================
    getStandings(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_standings')
                .select('*, league_players(display_name, current_handicap), league_teams(team_name)')
                .eq('league_id', leagueId)
                .order('current_rank');
            if (error) {
                throw new Error(`Failed to fetch standings: ${error.message}`);
            }
            return (data || []).map((s) => {
                var _a, _b, _c;
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
                    teamId: s.league_team_id || undefined,
                    teamName: ((_c = s.league_teams) === null || _c === void 0 ? void 0 : _c.team_name) || undefined,
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
                .select('*, league_courses(course_name, total_par)')
                .eq('league_id', leagueId)
                .in('status', ['active', 'scoring'])
                .order('week_number', { ascending: false })
                .limit(1)
                .single();
            // Resolve course info for this week
            let courseName;
            let coursePar;
            if (activeWeek === null || activeWeek === void 0 ? void 0 : activeWeek.league_courses) {
                courseName = activeWeek.league_courses.course_name;
                coursePar = activeWeek.league_courses.total_par;
            }
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
                    courseName,
                    coursePar,
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
            const scoringType = league.scoring_type || 'net_stroke_play';
            // Get all finalized weeks
            const { data: finalizedWeeks } = yield database_1.supabase
                .from('league_weeks')
                .select('id')
                .eq('league_id', leagueId)
                .eq('status', 'finalized')
                .order('week_number');
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
            // Calculate per-player stats
            const playerStats = new Map();
            // For points-based scoring, compute weekly rankings first
            let weeklyRankings = null; // weekId -> playerId -> rank
            if (scoringType === 'points_based') {
                weeklyRankings = new Map();
                for (const weekId of weekIds) {
                    const weekPlayerScores = [];
                    for (const player of players) {
                        const weekMap = scoresByPlayerWeek.get(player.id);
                        const gross = weekMap === null || weekMap === void 0 ? void 0 : weekMap.get(weekId);
                        if (gross !== undefined) {
                            const handicap = player.current_handicap || 0;
                            weekPlayerScores.push({
                                playerId: player.id,
                                net: gross - handicap,
                            });
                        }
                    }
                    // Sort by net ascending (lower is better)
                    weekPlayerScores.sort((a, b) => a.net - b.net);
                    const rankMap = new Map();
                    weekPlayerScores.forEach((entry, idx) => {
                        rankMap.set(entry.playerId, idx + 1);
                    });
                    weeklyRankings.set(weekId, rankMap);
                }
            }
            // Now compute stats for each player
            for (const player of players) {
                const weekMap = scoresByPlayerWeek.get(player.id);
                if (!weekMap || weekMap.size === 0) {
                    playerStats.set(player.id, {
                        weeksPlayed: 0,
                        totalGross: 0,
                        totalNet: 0,
                        bestGross: null,
                        roundGrosses: [],
                        points: 0,
                    });
                    continue;
                }
                const roundGrosses = [];
                let totalGross = 0;
                let bestGross = null;
                let totalPoints = 0;
                weekMap.forEach((gross) => {
                    roundGrosses.push(gross);
                    totalGross += gross;
                    if (bestGross === null || gross < bestGross) {
                        bestGross = gross;
                    }
                });
                const handicap = player.current_handicap || 0;
                const totalNet = totalGross - (handicap * weekMap.size);
                // Calculate points if points-based
                if (scoringType === 'points_based' && weeklyRankings) {
                    const config = league.points_config || {
                        win_week: 10,
                        second_place: 7,
                        third_place: 5,
                        participation: 2,
                        low_gross_bonus: 3,
                    };
                    for (const weekId of weekIds) {
                        const rankMap = weeklyRankings.get(weekId);
                        if (!rankMap)
                            continue;
                        const rank = rankMap.get(player.id);
                        if (rank === undefined)
                            continue;
                        // Award points based on placement
                        if (rank === 1) {
                            totalPoints += config.win_week;
                        }
                        else if (rank === 2) {
                            totalPoints += config.second_place;
                        }
                        else if (rank === 3) {
                            totalPoints += config.third_place;
                        }
                        else {
                            totalPoints += config.participation;
                        }
                        // Low gross bonus: check if this player had the lowest gross for the week
                        const weekGross = weekMap.get(weekId);
                        if (weekGross !== undefined) {
                            let isLowestGross = true;
                            for (const otherPlayer of players) {
                                if (otherPlayer.id === player.id)
                                    continue;
                                const otherWeekMap = scoresByPlayerWeek.get(otherPlayer.id);
                                const otherGross = otherWeekMap === null || otherWeekMap === void 0 ? void 0 : otherWeekMap.get(weekId);
                                if (otherGross !== undefined && otherGross < weekGross) {
                                    isLowestGross = false;
                                    break;
                                }
                            }
                            if (isLowestGross) {
                                totalPoints += config.low_gross_bonus;
                            }
                        }
                    }
                }
                playerStats.set(player.id, {
                    weeksPlayed: weekMap.size,
                    totalGross,
                    totalNet: Math.round(totalNet * 10) / 10,
                    bestGross,
                    roundGrosses,
                    points: totalPoints,
                });
            }
            // Sort players based on scoring type
            const rankedPlayers = [...playerStats.entries()]
                .sort((a, b) => {
                // Players with no weeks come last
                if (a[1].weeksPlayed === 0 && b[1].weeksPlayed > 0)
                    return 1;
                if (a[1].weeksPlayed > 0 && b[1].weeksPlayed === 0)
                    return -1;
                if (scoringType === 'gross_stroke_play') {
                    return a[1].totalGross - b[1].totalGross;
                }
                else if (scoringType === 'points_based') {
                    return b[1].points - a[1].points; // Higher points = better
                }
                else {
                    // net_stroke_play (default)
                    return a[1].totalNet - b[1].totalNet;
                }
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
                    points: stats.points,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'league_id,league_player_id' });
            }
        });
    }
    // =====================================================
    // TEAM STANDINGS RECALCULATION
    // =====================================================
    recalculateTeamStandings(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Get all active teams for this league
            const { data: teams } = yield database_1.supabase
                .from('league_teams')
                .select('id, team_name, status')
                .eq('league_id', leagueId)
                .in('status', ['active']);
            if (!teams || teams.length === 0)
                return;
            // Get all finalized weeks
            const { data: finalizedWeeks } = yield database_1.supabase
                .from('league_weeks')
                .select('id')
                .eq('league_id', leagueId)
                .eq('status', 'finalized')
                .order('week_number');
            const weekIds = (finalizedWeeks || []).map((w) => w.id);
            if (weekIds.length === 0)
                return;
            // Calculate team scores for each team across all finalized weeks
            const teamStats = new Map();
            for (const team of teams) {
                let weeksPlayed = 0;
                let totalGross = 0;
                let totalNet = 0;
                let bestGross = null;
                for (const weekId of weekIds) {
                    const result = yield this.calculateTeamScore(team.id, weekId, league);
                    if (result.teamGross > 0) {
                        weeksPlayed++;
                        totalGross += result.teamGross;
                        totalNet += result.teamNet;
                        if (bestGross === null || result.teamGross < bestGross) {
                            bestGross = result.teamGross;
                        }
                    }
                }
                teamStats.set(team.id, {
                    weeksPlayed,
                    totalGross,
                    totalNet: Math.round(totalNet * 10) / 10,
                    bestGross,
                    points: 0, // Team points can be added later if needed
                });
            }
            // Rank teams by net score (ascending = better)
            const rankedTeams = [...teamStats.entries()]
                .sort((a, b) => {
                if (a[1].weeksPlayed === 0 && b[1].weeksPlayed > 0)
                    return 1;
                if (a[1].weeksPlayed > 0 && b[1].weeksPlayed === 0)
                    return -1;
                return a[1].totalNet - b[1].totalNet;
            });
            // Upsert team standings
            for (let i = 0; i < rankedTeams.length; i++) {
                const [teamId, stats] = rankedTeams[i];
                const avgGross = stats.weeksPlayed > 0
                    ? Math.round((stats.totalGross / stats.weeksPlayed) * 10) / 10
                    : 0;
                // Get any member's league_player_id to use as the reference player for this team standing
                const { data: teamMember } = yield database_1.supabase
                    .from('league_players')
                    .select('id')
                    .eq('league_team_id', teamId)
                    .limit(1)
                    .single();
                if (!teamMember)
                    continue;
                yield database_1.supabase
                    .from('league_standings')
                    .upsert({
                    league_id: leagueId,
                    league_player_id: teamMember.id,
                    league_team_id: teamId,
                    weeks_played: stats.weeksPlayed,
                    total_gross: stats.totalGross,
                    total_net: stats.totalNet,
                    best_gross: stats.bestGross,
                    avg_gross: avgGross,
                    current_rank: stats.weeksPlayed > 0 ? i + 1 : 0,
                    points: stats.points,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'league_id,league_player_id' });
            }
        });
    }
    // =====================================================
    // TEAM LEADERBOARD
    // =====================================================
    getTeamLeaderboard(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.format !== 'team') {
                throw new Error('This league is not a team league');
            }
            // Get all active teams
            const { data: teams } = yield database_1.supabase
                .from('league_teams')
                .select('id, team_name, status')
                .eq('league_id', leagueId)
                .in('status', ['active']);
            if (!teams || teams.length === 0)
                return [];
            // Get the current active week
            const { data: activeWeek } = yield database_1.supabase
                .from('league_weeks')
                .select('*, league_courses(course_name, total_par)')
                .eq('league_id', leagueId)
                .in('status', ['active', 'scoring'])
                .order('week_number', { ascending: false })
                .limit(1)
                .single();
            let courseName;
            let coursePar;
            if (activeWeek === null || activeWeek === void 0 ? void 0 : activeWeek.league_courses) {
                courseName = activeWeek.league_courses.course_name;
                coursePar = activeWeek.league_courses.total_par;
            }
            // Get team standings
            const { data: standings } = yield database_1.supabase
                .from('league_standings')
                .select('*')
                .eq('league_id', leagueId)
                .not('league_team_id', 'is', null);
            const standingsMap = new Map((standings || []).map((s) => [s.league_team_id, s]));
            // Build entries for each team
            const entries = [];
            for (const team of teams) {
                // Get team members
                const { data: members } = yield database_1.supabase
                    .from('league_players')
                    .select('id, user_id, display_name, current_handicap')
                    .eq('league_team_id', team.id)
                    .neq('enrollment_status', 'withdrawn');
                if (!members)
                    continue;
                const memberIds = members.map(m => m.id);
                // Get today's scores for team members
                let memberEntries = [];
                let teamTodayGross = 0;
                let teamTodayNet = 0;
                if (activeWeek) {
                    const { data: todayScores } = yield database_1.supabase
                        .from('league_scores')
                        .select('league_player_id, hole_number, strokes')
                        .eq('league_week_id', activeWeek.id)
                        .in('league_player_id', memberIds);
                    // Aggregate per member
                    const memberScoreMap = new Map();
                    (todayScores || []).forEach((s) => {
                        const existing = memberScoreMap.get(s.league_player_id) || { gross: 0, holes: 0 };
                        existing.gross += s.strokes;
                        existing.holes += 1;
                        memberScoreMap.set(s.league_player_id, existing);
                    });
                    memberEntries = members.map(m => {
                        const scores = memberScoreMap.get(m.id);
                        // Get individual season standings
                        const memberStanding = (standings || []).find((s) => s.league_player_id === m.id && !s.league_team_id);
                        return {
                            playerId: m.id,
                            displayName: m.display_name,
                            handicap: m.current_handicap || 0,
                            todayGross: (scores === null || scores === void 0 ? void 0 : scores.gross) || 0,
                            todayNet: scores ? (0, handicap_utils_1.calculateNetScore)(scores.gross, m.current_handicap || 0) : 0,
                            thru: (scores === null || scores === void 0 ? void 0 : scores.holes) || 0,
                            seasonGross: (memberStanding === null || memberStanding === void 0 ? void 0 : memberStanding.total_gross) || 0,
                            seasonNet: (memberStanding === null || memberStanding === void 0 ? void 0 : memberStanding.total_net) || 0,
                        };
                    });
                    // Calculate team today score based on scoring format
                    if (todayScores && todayScores.length > 0) {
                        const result = yield this.calculateTeamScore(team.id, activeWeek.id, league);
                        teamTodayGross = result.teamGross;
                        teamTodayNet = result.teamNet;
                    }
                }
                else {
                    memberEntries = members.map(m => ({
                        playerId: m.id,
                        displayName: m.display_name,
                        handicap: m.current_handicap || 0,
                        todayGross: 0,
                        todayNet: 0,
                        thru: 0,
                        seasonGross: 0,
                        seasonNet: 0,
                    }));
                }
                const teamStanding = standingsMap.get(team.id);
                entries.push({
                    rank: (teamStanding === null || teamStanding === void 0 ? void 0 : teamStanding.current_rank) || 0,
                    teamId: team.id,
                    teamName: team.team_name,
                    status: team.status,
                    members: memberEntries,
                    teamTodayGross,
                    teamTodayNet: Math.round(teamTodayNet * 10) / 10,
                    teamSeasonGross: (teamStanding === null || teamStanding === void 0 ? void 0 : teamStanding.total_gross) || 0,
                    teamSeasonNet: (teamStanding === null || teamStanding === void 0 ? void 0 : teamStanding.total_net) || 0,
                    weeksPlayed: (teamStanding === null || teamStanding === void 0 ? void 0 : teamStanding.weeks_played) || 0,
                    scoringFormat: league.team_scoring_format || 'best_ball',
                    courseName,
                    coursePar,
                });
            }
            // Sort by today's team net score, then by season rank
            entries.sort((a, b) => {
                const aPlaying = a.members.some(m => m.thru > 0);
                const bPlaying = b.members.some(m => m.thru > 0);
                if (aPlaying && !bPlaying)
                    return -1;
                if (!aPlaying && bPlaying)
                    return 1;
                if (aPlaying && bPlaying) {
                    return a.teamTodayNet - b.teamTodayNet;
                }
                return a.rank - b.rank;
            });
            entries.forEach((entry, index) => {
                entry.rank = index + 1;
            });
            return entries;
        });
    }
    // =====================================================
    // HANDICAP RECALCULATION
    // =====================================================
    recalculateHandicaps(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            const players = yield this.getPlayers(leagueId);
            // Get all finalized weeks in order, including their course assignment
            const { data: finalizedWeeks } = yield database_1.supabase
                .from('league_weeks')
                .select('id, league_course_id')
                .eq('league_id', leagueId)
                .eq('status', 'finalized')
                .order('week_number');
            const weekIds = (finalizedWeeks || []).map((w) => w.id);
            if (weekIds.length === 0)
                return;
            // Build a map of weekId -> totalPar (from course data or fallback)
            const weekParMap = new Map();
            const courseCache = new Map(); // courseId -> totalPar
            for (const week of (finalizedWeeks || [])) {
                if (week.league_course_id) {
                    if (!courseCache.has(week.league_course_id)) {
                        const { data: course } = yield database_1.supabase
                            .from('league_courses')
                            .select('total_par')
                            .eq('id', week.league_course_id)
                            .single();
                        courseCache.set(week.league_course_id, (course === null || course === void 0 ? void 0 : course.total_par) || (league.num_holes * league.par_per_hole));
                    }
                    weekParMap.set(week.id, courseCache.get(week.league_course_id));
                }
                else {
                    // Fallback to legacy par_per_hole calculation
                    weekParMap.set(week.id, league.num_holes * league.par_per_hole);
                }
            }
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
                // Build differentials in week order using actual course par
                const differentials = [];
                for (const wId of weekIds) {
                    const gross = weekGrosses.get(wId);
                    if (gross !== undefined) {
                        const totalPar = weekParMap.get(wId) || (league.num_holes * league.par_per_hole);
                        differentials.push((0, handicap_utils_1.calculateDifferentialFromPar)(gross, totalPar));
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
                            type: 'calculated',
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
            // Calculate total amount: season fee + full prize pot for the entire season
            const totalPrizePot = league.weekly_prize_pot * league.total_weeks;
            const totalAmount = (league.season_fee + totalPrizePot) * 100; // cents
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
                    prize_pot_per_week: String(league.weekly_prize_pot),
                    prize_pot_total: String(totalPrizePot),
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
                        attendance_required: league.attendance_required || false,
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
            // Get current active week (with course info)
            const { data: activeWeek } = yield database_1.supabase
                .from('league_weeks')
                .select('*, league_courses(id, course_name, num_holes, hole_pars, total_par)')
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
            if (activeWeek && player) {
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
            // Extract course data
            const courseData = activeWeek === null || activeWeek === void 0 ? void 0 : activeWeek.league_courses;
            // Build teammates array if the player is on a team
            let teammates = null;
            console.log('[kiosk-state] teammates check:', {
                hasPlayer: !!player,
                leagueTeamId: player === null || player === void 0 ? void 0 : player.league_team_id,
                hasActiveWeek: !!activeWeek,
            });
            if (player && player.league_team_id && activeWeek) {
                const { data: teamPlayers, error: teamError } = yield database_1.supabase
                    .from('league_players')
                    .select('id, display_name, current_handicap')
                    .eq('league_team_id', player.league_team_id)
                    .neq('enrollment_status', 'withdrawn')
                    .order('created_at');
                console.log('[kiosk-state] teamPlayers query:', {
                    count: teamPlayers === null || teamPlayers === void 0 ? void 0 : teamPlayers.length,
                    error: teamError === null || teamError === void 0 ? void 0 : teamError.message,
                    ids: teamPlayers === null || teamPlayers === void 0 ? void 0 : teamPlayers.map((tp) => tp.id),
                });
                if (teamPlayers && teamPlayers.length > 1) {
                    const playerIds = teamPlayers.map((tp) => tp.id);
                    const { data: allScores } = yield database_1.supabase
                        .from('league_scores')
                        .select('league_player_id, hole_number, strokes')
                        .eq('league_week_id', activeWeek.id)
                        .in('league_player_id', playerIds)
                        .order('hole_number');
                    const scoresByPlayer = {};
                    for (const s of (allScores || [])) {
                        if (!scoresByPlayer[s.league_player_id]) {
                            scoresByPlayer[s.league_player_id] = [];
                        }
                        scoresByPlayer[s.league_player_id].push({ hole_number: s.hole_number, strokes: s.strokes });
                    }
                    teammates = teamPlayers.map((tp) => {
                        const tpScores = scoresByPlayer[tp.id] || [];
                        const tpNextHole = tpScores.length > 0
                            ? Math.max(...tpScores.map((s) => s.hole_number)) + 1
                            : 1;
                        return {
                            id: tp.id,
                            displayName: tp.display_name,
                            handicap: tp.current_handicap,
                            scores: tpScores,
                            nextHole: Math.min(tpNextHole, league.num_holes),
                            roundComplete: tpScores.length >= league.num_holes,
                        };
                    });
                }
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
                course: courseData ? {
                    id: courseData.id,
                    courseName: courseData.course_name,
                    numHoles: courseData.num_holes,
                    holePars: courseData.hole_pars,
                    totalPar: courseData.total_par,
                } : null,
                player: player ? {
                    id: player.id,
                    displayName: player.display_name,
                    handicap: player.current_handicap,
                } : null,
                scores,
                nextHole: Math.min(nextHole, league.num_holes),
                roundComplete: player ? scores.length >= league.num_holes : false,
                teammates,
            };
        });
    }
    // =====================================================
    // SCORE AUDITABILITY — CONFIRM / OVERRIDE
    // =====================================================
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
    // =====================================================
    // COMMISSIONER POWERS — HANDICAP OVERRIDE
    // =====================================================
    overrideHandicap(leagueId, playerId, newHandicap, overriddenBy, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get current handicap
            const { data: player, error: playerError } = yield database_1.supabase
                .from('league_players')
                .select('current_handicap')
                .eq('id', playerId)
                .eq('league_id', leagueId)
                .single();
            if (playerError || !player) {
                throw new Error(`Player not found: ${playerError === null || playerError === void 0 ? void 0 : playerError.message}`);
            }
            const oldHandicap = player.current_handicap;
            // Update the handicap
            const { error } = yield database_1.supabase
                .from('league_players')
                .update({ current_handicap: newHandicap })
                .eq('id', playerId);
            if (error) {
                throw new Error(`Failed to override handicap: ${error.message}`);
            }
            // Record in history with manual override flag
            yield database_1.supabase
                .from('handicap_history')
                .insert({
                league_player_id: playerId,
                old_handicap: oldHandicap,
                new_handicap: newHandicap,
                calculation_details: {
                    type: 'manual_override',
                    reason,
                    overridden_by: overriddenBy,
                    differentials: [],
                    best_used: [],
                    average: 0,
                    multiplier: 0,
                },
            });
        });
    }
    // =====================================================
    // PRIZE POOL LEDGER
    // =====================================================
    /**
     * Calculate the weekly prize pot total based on active players.
     */
    calculateWeeklyPot(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Count active players
            const { count, error } = yield database_1.supabase
                .from('league_players')
                .select('id', { count: 'exact', head: true })
                .eq('league_id', leagueId)
                .eq('enrollment_status', 'active');
            if (error)
                throw new Error(`Failed to count active players: ${error.message}`);
            const activePlayers = count || 0;
            const weeklyPot = activePlayers * league.weekly_prize_pot;
            // Store on the week record
            yield database_1.supabase
                .from('league_weeks')
                .update({ prize_pool_total: weeklyPot })
                .eq('id', weekId);
            return weeklyPot;
        });
    }
    /**
     * Generate payout ledger rows for a finalized week.
     * Uses the week's standings + league payout_config to determine 1st/2nd/3rd payouts.
     */
    generateWeekPayouts(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            const payoutConfig = league.payout_config || {
                first_pct: 50,
                second_pct: 30,
                third_pct: 20,
                payout_method: 'weekly',
            };
            // Calculate the weekly pot
            const weeklyPot = yield this.calculateWeeklyPot(leagueId, weekId);
            if (weeklyPot <= 0)
                return [];
            // Get weekly scores to determine placement
            // We need each player's total gross/net for this week
            const { data: weekScores, error: scoresError } = yield database_1.supabase
                .from('league_scores')
                .select('league_player_id, strokes')
                .eq('league_week_id', weekId);
            if (scoresError || !weekScores || weekScores.length === 0) {
                console.log(`No scores found for week ${weekId}, skipping payout generation.`);
                return [];
            }
            // Aggregate per player
            const playerTotals = {};
            for (const s of weekScores) {
                playerTotals[s.league_player_id] = (playerTotals[s.league_player_id] || 0) + s.strokes;
            }
            // Get player handicaps for net scoring
            const playerIds = Object.keys(playerTotals);
            const { data: players } = yield database_1.supabase
                .from('league_players')
                .select('id, display_name, current_handicap')
                .in('id', playerIds);
            const playersMap = new Map((players || []).map(p => [p.id, p]));
            // Calculate net scores and sort
            const scoringType = league.scoring_type || 'net_stroke_play';
            const ranked = playerIds.map(pid => {
                const gross = playerTotals[pid];
                const player = playersMap.get(pid);
                const handicap = (player === null || player === void 0 ? void 0 : player.current_handicap) || 0;
                const net = gross - handicap;
                return {
                    playerId: pid,
                    playerName: (player === null || player === void 0 ? void 0 : player.display_name) || 'Unknown',
                    gross,
                    net,
                    sortValue: scoringType === 'gross_stroke_play' ? gross : net,
                };
            }).sort((a, b) => a.sortValue - b.sortValue);
            // Only create payouts for up to 3 placements (or fewer if less players)
            const payoutEntries = [];
            const placements = [
                { place: 1, pct: payoutConfig.first_pct },
                { place: 2, pct: payoutConfig.second_pct },
                { place: 3, pct: payoutConfig.third_pct },
            ];
            // Get the week number for descriptions
            const { data: week } = yield database_1.supabase
                .from('league_weeks')
                .select('week_number')
                .eq('id', weekId)
                .single();
            const weekNum = (week === null || week === void 0 ? void 0 : week.week_number) || '?';
            for (let i = 0; i < Math.min(placements.length, ranked.length); i++) {
                const { place, pct } = placements[i];
                const amount = Math.round((weeklyPot * pct / 100) * 100) / 100; // round to cents
                if (amount <= 0)
                    continue;
                payoutEntries.push({
                    league_id: leagueId,
                    league_week_id: weekId,
                    league_player_id: ranked[i].playerId,
                    type: 'payout',
                    amount: -amount, // negative = money out
                    description: `${this.ordinal(place)} place - Week ${weekNum} ($${amount.toFixed(2)})`,
                    payout_status: 'pending',
                    placement: place,
                });
            }
            if (payoutEntries.length === 0)
                return [];
            const { data: inserted, error: insertError } = yield database_1.supabase
                .from('league_prize_ledger')
                .insert(payoutEntries)
                .select();
            if (insertError) {
                throw new Error(`Failed to generate payouts: ${insertError.message}`);
            }
            return inserted || [];
        });
    }
    /**
     * Confirm a single payout as paid.
     */
    confirmPayout(ledgerEntryId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_prize_ledger')
                .update({
                payout_status: 'paid',
                paid_at: new Date().toISOString(),
                paid_by: confirmedBy,
            })
                .eq('id', ledgerEntryId)
                .eq('type', 'payout');
            if (error) {
                throw new Error(`Failed to confirm payout: ${error.message}`);
            }
        });
    }
    /**
     * Batch-confirm all pending payouts for a week.
     */
    confirmWeekPayouts(leagueId, weekId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            // Mark all pending payouts for this week as paid
            const { error: ledgerError } = yield database_1.supabase
                .from('league_prize_ledger')
                .update({
                payout_status: 'paid',
                paid_at: new Date().toISOString(),
                paid_by: confirmedBy,
            })
                .eq('league_week_id', weekId)
                .eq('league_id', leagueId)
                .eq('type', 'payout')
                .eq('payout_status', 'pending');
            if (ledgerError) {
                throw new Error(`Failed to confirm week payouts: ${ledgerError.message}`);
            }
            // Mark the week as payouts confirmed
            const { error: weekError } = yield database_1.supabase
                .from('league_weeks')
                .update({ payouts_confirmed: true })
                .eq('id', weekId);
            if (weekError) {
                throw new Error(`Failed to mark week payouts as confirmed: ${weekError.message}`);
            }
        });
    }
    /**
     * Get a full summary of the prize pool for a league.
     */
    getPrizePoolSummary(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all ledger entries
            const { data: entries, error } = yield database_1.supabase
                .from('league_prize_ledger')
                .select('*')
                .eq('league_id', leagueId)
                .order('created_at', { ascending: true });
            if (error)
                throw new Error(`Failed to get prize pool summary: ${error.message}`);
            const allEntries = entries || [];
            const totalCollected = allEntries
                .filter(e => e.type === 'contribution')
                .reduce((sum, e) => sum + Number(e.amount), 0);
            const totalPaidOut = allEntries
                .filter(e => e.type === 'payout' && e.payout_status === 'paid')
                .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);
            const totalPending = allEntries
                .filter(e => e.type === 'payout' && e.payout_status === 'pending')
                .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);
            // Get week-by-week breakdown
            const { data: weeks } = yield database_1.supabase
                .from('league_weeks')
                .select('id, week_number, date, prize_pool_total, payouts_confirmed')
                .eq('league_id', leagueId)
                .order('week_number', { ascending: true });
            const weeklyBreakdown = [];
            for (const week of (weeks || [])) {
                const weekPayouts = allEntries
                    .filter(e => e.league_week_id === week.id && e.type === 'payout')
                    .map(e => ({
                    playerId: e.league_player_id,
                    playerName: '', // Will be filled below
                    placement: e.placement || 0,
                    amount: Math.abs(Number(e.amount)),
                    status: e.payout_status || 'pending',
                }));
                // Get player names
                if (weekPayouts.length > 0) {
                    const playerIds = weekPayouts.map(p => p.playerId);
                    const { data: players } = yield database_1.supabase
                        .from('league_players')
                        .select('id, display_name')
                        .in('id', playerIds);
                    const nameMap = new Map((players || []).map(p => [p.id, p.display_name]));
                    for (const payout of weekPayouts) {
                        payout.playerName = nameMap.get(payout.playerId) || 'Unknown';
                    }
                }
                weeklyBreakdown.push({
                    weekId: week.id,
                    weekNumber: week.week_number,
                    date: week.date,
                    prizePoolTotal: Number(week.prize_pool_total) || 0,
                    payoutsConfirmed: week.payouts_confirmed || false,
                    payouts: weekPayouts.sort((a, b) => a.placement - b.placement),
                });
            }
            return {
                totalCollected,
                totalPaidOut,
                totalPending,
                balance: totalCollected - totalPaidOut - totalPending,
                weeklyBreakdown,
            };
        });
    }
    /**
     * Get a player's prize pool history (contributions and payouts).
     */
    getPlayerPrizeHistory(leagueId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_prize_ledger')
                .select('*')
                .eq('league_id', leagueId)
                .eq('league_player_id', playerId)
                .order('created_at', { ascending: false });
            if (error)
                throw new Error(`Failed to get player prize history: ${error.message}`);
            return data || [];
        });
    }
    /**
     * Insert a contribution ledger entry (called from webhook on successful enrollment payment).
     */
    insertPrizeContribution(leagueId, leaguePlayerId, amount, description) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_prize_ledger')
                .insert({
                league_id: leagueId,
                league_player_id: leaguePlayerId,
                type: 'contribution',
                amount, // positive for money in
                description,
            });
            if (error) {
                console.error(`Failed to insert prize contribution:`, error);
                // Don't throw — contribution tracking failure shouldn't break enrollment
            }
        });
    }
    // Helper: ordinal suffix
    ordinal(n) {
        const suffixes = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
    }
    // =====================================================
    // TEAM MANAGEMENT
    // =====================================================
    /**
     * Create a team in a team league. The captain is automatically enrolled.
     */
    createTeam(leagueId, captainUserId, teamName) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.format !== 'team') {
                throw new Error('This league does not support teams');
            }
            if (league.status !== 'registration' && league.status !== 'active') {
                throw new Error('League is not accepting teams');
            }
            // Check if captain is already on a team in this league
            const { data: existingPlayer } = yield database_1.supabase
                .from('league_players')
                .select('id, league_team_id')
                .eq('league_id', leagueId)
                .eq('user_id', captainUserId)
                .neq('enrollment_status', 'withdrawn')
                .single();
            if (existingPlayer && existingPlayer.league_team_id) {
                throw new Error('You are already on a team in this league');
            }
            // Get captain's display name
            const { data: userProfile } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', captainUserId)
                .single();
            if (!userProfile) {
                throw new Error('User not found');
            }
            // Create the team
            const { data: team, error } = yield database_1.supabase
                .from('league_teams')
                .insert({
                league_id: leagueId,
                team_name: teamName,
                captain_user_id: captainUserId,
                players_per_team: league.players_per_team,
                status: 'forming',
            })
                .select()
                .single();
            if (error || !team) {
                if ((error === null || error === void 0 ? void 0 : error.code) === '23505') {
                    throw new Error('A team with that name already exists in this league');
                }
                throw new Error(`Failed to create team: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            // Create league_player record for the captain, linked to the team
            if (existingPlayer) {
                // Update existing player record to link to team
                yield database_1.supabase
                    .from('league_players')
                    .update({ league_team_id: team.id })
                    .eq('id', existingPlayer.id);
            }
            else {
                const { error: playerError } = yield database_1.supabase
                    .from('league_players')
                    .insert({
                    league_id: leagueId,
                    user_id: captainUserId,
                    display_name: userProfile.full_name || userProfile.email,
                    enrollment_status: 'pending',
                    season_paid: false,
                    prize_pot_paid: false,
                    league_team_id: team.id,
                });
                if (playerError) {
                    console.error('Failed to create captain player record:', playerError);
                }
            }
            return team;
        });
    }
    /**
     * Invite teammates by email. Only existing users can be invited.
     */
    inviteTeammates(teamId, captainUserId, emails) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Verify team exists and user is captain
            const { data: team, error: teamError } = yield database_1.supabase
                .from('league_teams')
                .select('*, leagues(id, name, players_per_team, total_weeks, season_fee, weekly_prize_pot, num_holes)')
                .eq('id', teamId)
                .single();
            if (teamError || !team) {
                throw new Error('Team not found');
            }
            if (team.captain_user_id !== captainUserId) {
                throw new Error('Only the team captain can invite teammates');
            }
            if (team.status !== 'forming') {
                throw new Error('Team is no longer accepting invites');
            }
            const league = team.leagues;
            // Check how many slots remain
            const { count: existingInvites } = yield database_1.supabase
                .from('league_team_invites')
                .select('id', { count: 'exact', head: true })
                .eq('league_team_id', teamId)
                .in('status', ['pending', 'accepted']);
            const { count: existingMembers } = yield database_1.supabase
                .from('league_players')
                .select('id', { count: 'exact', head: true })
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            const totalSlotsTaken = (existingMembers || 0);
            const maxNeeded = league.players_per_team - totalSlotsTaken;
            if (emails.length > maxNeeded) {
                throw new Error(`Team only has ${maxNeeded} open slot(s). You tried to invite ${emails.length} player(s).`);
            }
            const invited = [];
            const errors = [];
            for (const email of emails) {
                const normalizedEmail = email.toLowerCase().trim();
                // Find user by email
                const { data: user } = yield database_1.supabase
                    .from('user_profiles')
                    .select('id, full_name, email')
                    .eq('email', normalizedEmail)
                    .single();
                if (!user) {
                    errors.push({ email: normalizedEmail, reason: 'No account found with this email' });
                    continue;
                }
                if (user.id === captainUserId) {
                    errors.push({ email: normalizedEmail, reason: 'You cannot invite yourself' });
                    continue;
                }
                // Check if already invited to this team
                const { data: existingInvite } = yield database_1.supabase
                    .from('league_team_invites')
                    .select('id, status')
                    .eq('league_team_id', teamId)
                    .eq('invited_user_id', user.id)
                    .in('status', ['pending', 'accepted'])
                    .single();
                if (existingInvite) {
                    errors.push({ email: normalizedEmail, reason: 'Already invited to this team' });
                    continue;
                }
                // Check if already on another team in this league
                const { data: otherTeamPlayer } = yield database_1.supabase
                    .from('league_players')
                    .select('id, league_team_id')
                    .eq('league_id', team.league_id)
                    .eq('user_id', user.id)
                    .neq('enrollment_status', 'withdrawn')
                    .not('league_team_id', 'is', null)
                    .single();
                if (otherTeamPlayer) {
                    errors.push({ email: normalizedEmail, reason: 'Already on a team in this league' });
                    continue;
                }
                // Create invite
                const { data: invite, error: inviteError } = yield database_1.supabase
                    .from('league_team_invites')
                    .insert({
                    league_team_id: teamId,
                    invited_user_id: user.id,
                    invited_email: normalizedEmail,
                    status: 'pending',
                })
                    .select()
                    .single();
                if (inviteError || !invite) {
                    errors.push({ email: normalizedEmail, reason: `Failed to create invite: ${inviteError === null || inviteError === void 0 ? void 0 : inviteError.message}` });
                    continue;
                }
                invited.push(invite);
                // Send invite email (fire-and-forget)
                const frontendUrl = process.env.FRONTEND_URL || 'https://golflabs.us';
                const captainProfile = yield database_1.supabase
                    .from('user_profiles')
                    .select('full_name')
                    .eq('id', captainUserId)
                    .single();
                email_service_1.EmailService.sendTeamInviteEmail({
                    invitedUserName: user.full_name || user.email,
                    invitedEmail: normalizedEmail,
                    captainName: ((_a = captainProfile.data) === null || _a === void 0 ? void 0 : _a.full_name) || 'Your teammate',
                    teamName: team.team_name,
                    leagueName: league.name,
                    seasonFee: league.season_fee || 0,
                    weeklyPrizePot: league.weekly_prize_pot || 0,
                    totalWeeks: league.total_weeks || 0,
                    numHoles: league.num_holes || 9,
                    playersPerTeam: league.players_per_team,
                    acceptUrl: `${frontendUrl}/team-invite/${invite.invite_token}`,
                    declineUrl: `${frontendUrl}/team-invite/${invite.invite_token}?action=decline`,
                }).catch(err => console.error('Failed to send team invite email:', err));
            }
            return { invited, errors };
        });
    }
    /**
     * Accept a team invite. Creates a league_player record linked to the team.
     */
    acceptInvite(inviteToken, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Find the invite by token
            const { data: invite, error: inviteError } = yield database_1.supabase
                .from('league_team_invites')
                .select('*, league_teams(*, leagues(*))')
                .eq('invite_token', inviteToken)
                .single();
            if (inviteError || !invite) {
                throw new Error('Invite not found or invalid token');
            }
            if (invite.status !== 'pending') {
                throw new Error(`Invite has already been ${invite.status}`);
            }
            if (invite.invited_user_id !== userId) {
                throw new Error('This invite was not sent to you');
            }
            const team = invite.league_teams;
            const league = team === null || team === void 0 ? void 0 : team.leagues;
            if (!team || !league) {
                throw new Error('Team or league not found');
            }
            // Accept the invite
            const { data: updatedInvite, error: updateError } = yield database_1.supabase
                .from('league_team_invites')
                .update({
                status: 'accepted',
                responded_at: new Date().toISOString(),
            })
                .eq('id', invite.id)
                .select()
                .single();
            if (updateError || !updatedInvite) {
                throw new Error(`Failed to accept invite: ${updateError === null || updateError === void 0 ? void 0 : updateError.message}`);
            }
            // Get user profile for display name
            const { data: userProfile } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', userId)
                .single();
            // Create league_player record (pending - payment not yet done)
            const { error: playerError } = yield database_1.supabase
                .from('league_players')
                .upsert({
                league_id: team.league_id,
                user_id: userId,
                display_name: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.full_name) || (userProfile === null || userProfile === void 0 ? void 0 : userProfile.email) || 'Unknown',
                enrollment_status: 'pending',
                season_paid: false,
                prize_pot_paid: false,
                league_team_id: team.id,
            }, { onConflict: 'league_id,user_id' });
            if (playerError) {
                console.error('Failed to create player record on invite accept:', playerError);
            }
            // Check if all invites are now accepted
            yield this.checkAndTransitionTeamStatus(team.id);
            return { team, invite: updatedInvite };
        });
    }
    /**
     * Decline a team invite.
     */
    declineInvite(inviteToken, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: invite, error: inviteError } = yield database_1.supabase
                .from('league_team_invites')
                .select('*')
                .eq('invite_token', inviteToken)
                .single();
            if (inviteError || !invite) {
                throw new Error('Invite not found or invalid token');
            }
            if (invite.status !== 'pending') {
                throw new Error(`Invite has already been ${invite.status}`);
            }
            if (invite.invited_user_id !== userId) {
                throw new Error('This invite was not sent to you');
            }
            yield database_1.supabase
                .from('league_team_invites')
                .update({
                status: 'declined',
                responded_at: new Date().toISOString(),
            })
                .eq('id', invite.id);
        });
    }
    /**
     * Get invite details by token (public - for the invite page).
     */
    getInviteByToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_team_invites')
                .select('*, league_teams(team_name, captain_user_id, status, league_id, leagues(name, season_fee, weekly_prize_pot, total_weeks, start_time, num_holes, format, players_per_team, team_scoring_format))')
                .eq('invite_token', token)
                .single();
            if (error || !data) {
                throw new Error('Invite not found');
            }
            const team = data.league_teams;
            const league = team === null || team === void 0 ? void 0 : team.leagues;
            // Get captain name
            const { data: captain } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name')
                .eq('id', team.captain_user_id)
                .single();
            return {
                id: data.id,
                status: data.status,
                invitedEmail: data.invited_email,
                invitedUserId: data.invited_user_id,
                inviteToken: data.invite_token,
                teamName: team.team_name,
                teamStatus: team.status,
                captainName: (captain === null || captain === void 0 ? void 0 : captain.full_name) || 'Unknown',
                league: league ? {
                    id: league.id || team.league_id,
                    name: league.name,
                    seasonFee: league.season_fee,
                    weeklyPrizePot: league.weekly_prize_pot,
                    totalWeeks: league.total_weeks,
                    startTime: league.start_time,
                    numHoles: league.num_holes,
                    format: league.format,
                    playersPerTeam: league.players_per_team,
                    teamScoringFormat: league.team_scoring_format,
                } : null,
            };
        });
    }
    /**
     * Check if all invites are accepted and transition the team status.
     */
    checkAndTransitionTeamStatus(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: team } = yield database_1.supabase
                .from('league_teams')
                .select('*, leagues(players_per_team)')
                .eq('id', teamId)
                .single();
            if (!team)
                return;
            const playersPerTeam = ((_a = team.leagues) === null || _a === void 0 ? void 0 : _a.players_per_team) || team.players_per_team;
            // Count current members (league_players linked to this team, not withdrawn)
            const { count: memberCount } = yield database_1.supabase
                .from('league_players')
                .select('id', { count: 'exact', head: true })
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            // If team is full, move to pending_payment
            if ((memberCount || 0) >= playersPerTeam && team.status === 'forming') {
                yield database_1.supabase
                    .from('league_teams')
                    .update({ status: 'pending_payment' })
                    .eq('id', teamId);
            }
        });
    }
    /**
     * Get teams for a league.
     */
    getTeams(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: teams, error } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('league_id', leagueId)
                .order('created_at', { ascending: true });
            if (error) {
                throw new Error(`Failed to fetch teams: ${error.message}`);
            }
            // Enrich with members and invites
            const enrichedTeams = [];
            for (const team of (teams || [])) {
                // Get captain name
                const { data: captain } = yield database_1.supabase
                    .from('user_profiles')
                    .select('full_name')
                    .eq('id', team.captain_user_id)
                    .single();
                // Get team members
                const { data: members } = yield database_1.supabase
                    .from('league_players')
                    .select('id, user_id, display_name, enrollment_status, season_paid, prize_pot_paid')
                    .eq('league_team_id', team.id)
                    .neq('enrollment_status', 'withdrawn');
                // Get invites
                const { data: invites } = yield database_1.supabase
                    .from('league_team_invites')
                    .select('*')
                    .eq('league_team_id', team.id)
                    .order('invited_at');
                enrichedTeams.push(Object.assign(Object.assign({}, team), { captain_name: (captain === null || captain === void 0 ? void 0 : captain.full_name) || 'Unknown', members: (members || []).map(m => ({
                        league_player_id: m.id,
                        user_id: m.user_id,
                        display_name: m.display_name,
                        enrollment_status: m.enrollment_status,
                        season_paid: m.season_paid,
                        prize_pot_paid: m.prize_pot_paid,
                        is_captain: m.user_id === team.captain_user_id,
                    })), invites: invites || [] }));
            }
            return enrichedTeams;
        });
    }
    /**
     * Get a single team with full details.
     */
    getTeam(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: team, error } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('id', teamId)
                .single();
            if (error || !team) {
                throw new Error(`Team not found: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            const { data: captain } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name')
                .eq('id', team.captain_user_id)
                .single();
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, user_id, display_name, enrollment_status, season_paid, prize_pot_paid')
                .eq('league_team_id', team.id)
                .neq('enrollment_status', 'withdrawn');
            const { data: invites } = yield database_1.supabase
                .from('league_team_invites')
                .select('*')
                .eq('league_team_id', team.id)
                .order('invited_at');
            return Object.assign(Object.assign({}, team), { captain_name: (captain === null || captain === void 0 ? void 0 : captain.full_name) || 'Unknown', members: (members || []).map(m => ({
                    league_player_id: m.id,
                    user_id: m.user_id,
                    display_name: m.display_name,
                    enrollment_status: m.enrollment_status,
                    season_paid: m.season_paid,
                    prize_pot_paid: m.prize_pot_paid,
                    is_captain: m.user_id === team.captain_user_id,
                })), invites: invites || [] });
        });
    }
    /**
     * Pay for team enrollment (individual player). Same as enrollAndPay but with team context.
     */
    enrollTeamPlayer(leagueId, teamId, userId, displayName) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.format !== 'team') {
                throw new Error('This league does not support teams');
            }
            // Verify team exists and is in valid state
            const { data: team } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('id', teamId)
                .single();
            if (!team) {
                throw new Error('Team not found');
            }
            if (team.status !== 'pending_payment' && team.status !== 'forming') {
                throw new Error(`Team is in '${team.status}' status and cannot accept payments`);
            }
            // Get the player's existing record (should already exist from invite accept or team creation)
            const { data: existingPlayer } = yield database_1.supabase
                .from('league_players')
                .select('*')
                .eq('league_id', leagueId)
                .eq('user_id', userId)
                .eq('league_team_id', teamId)
                .single();
            if (!existingPlayer) {
                throw new Error('You must accept the team invite before paying');
            }
            if (existingPlayer.enrollment_status === 'active' && existingPlayer.season_paid) {
                throw new Error('You have already paid for this league');
            }
            // Calculate total amount: season fee + full prize pot for the entire season
            const totalPrizePot = league.weekly_prize_pot * league.total_weeks;
            const totalAmount = (league.season_fee + totalPrizePot) * 100; // cents
            if (totalAmount === 0) {
                // Free league — activate immediately
                yield database_1.supabase
                    .from('league_players')
                    .update({ enrollment_status: 'active', season_paid: true, prize_pot_paid: true })
                    .eq('id', existingPlayer.id);
                yield database_1.supabase
                    .from('league_standings')
                    .upsert({ league_id: leagueId, league_player_id: existingPlayer.id }, { onConflict: 'league_id,league_player_id' });
                // Check if all team members have paid
                yield this.checkTeamAllPaid(teamId);
                return { clientSecret: '', playerId: existingPlayer.id };
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
                    league_player_id: existingPlayer.id,
                    league_team_id: teamId,
                    season_fee: String(league.season_fee),
                    prize_pot_per_week: String(league.weekly_prize_pot),
                    prize_pot_total: String(totalPrizePot),
                },
            });
            // Store payment intent ID on the player record
            yield database_1.supabase
                .from('league_players')
                .update({ stripe_payment_intent_id: paymentIntent.id })
                .eq('id', existingPlayer.id);
            return {
                clientSecret: paymentIntent.client_secret,
                playerId: existingPlayer.id,
            };
        });
    }
    /**
     * Check if all team members have paid and transition team to 'active' if so.
     */
    checkTeamAllPaid(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: team } = yield database_1.supabase
                .from('league_teams')
                .select('*, leagues(players_per_team)')
                .eq('id', teamId)
                .single();
            if (!team)
                return false;
            const playersPerTeam = ((_a = team.leagues) === null || _a === void 0 ? void 0 : _a.players_per_team) || team.players_per_team;
            // Get all team members
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, enrollment_status, season_paid')
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            if (!members || members.length < playersPerTeam)
                return false;
            const allPaid = members.every(m => m.enrollment_status === 'active' && m.season_paid);
            if (allPaid && (team.status === 'pending_payment' || team.status === 'forming')) {
                yield database_1.supabase
                    .from('league_teams')
                    .update({ status: 'active' })
                    .eq('id', teamId);
                // Create standings rows for team members who don't have one
                for (const member of members) {
                    yield database_1.supabase
                        .from('league_standings')
                        .upsert({
                        league_id: team.league_id,
                        league_player_id: member.id,
                        league_team_id: teamId,
                    }, { onConflict: 'league_id,league_player_id' });
                }
                return true;
            }
            return false;
        });
    }
    /**
     * Disqualify a team and refund paid members.
     */
    disqualifyTeam(teamId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: team, error: teamError } = yield database_1.supabase
                .from('league_teams')
                .select('*')
                .eq('id', teamId)
                .single();
            if (teamError || !team) {
                throw new Error('Team not found');
            }
            // Mark team as disqualified
            yield database_1.supabase
                .from('league_teams')
                .update({ status: 'disqualified' })
                .eq('id', teamId);
            // Get all team members
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, user_id, display_name, enrollment_status, season_paid, stripe_payment_intent_id')
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            const refundedPlayers = [];
            for (const member of (members || [])) {
                // Refund paid members
                if (member.season_paid && member.stripe_payment_intent_id) {
                    try {
                        yield stripe_1.stripe.refunds.create({
                            payment_intent: member.stripe_payment_intent_id,
                            metadata: {
                                league_id: team.league_id,
                                league_player_id: member.id,
                                league_team_id: teamId,
                                reason: `Team disqualified: ${reason}`,
                            },
                        });
                        refundedPlayers.push(member.display_name);
                    }
                    catch (refundError) {
                        console.error(`Failed to refund player ${member.id}:`, refundError.message);
                    }
                }
                // Mark all team members as withdrawn
                yield database_1.supabase
                    .from('league_players')
                    .update({ enrollment_status: 'withdrawn' })
                    .eq('id', member.id);
                // Cancel any pending prize ledger entries for this player
                yield database_1.supabase
                    .from('league_prize_ledger')
                    .update({ payout_status: 'cancelled' })
                    .eq('league_player_id', member.id)
                    .eq('league_id', team.league_id)
                    .eq('payout_status', 'pending');
            }
            // Expire any pending invites
            yield database_1.supabase
                .from('league_team_invites')
                .update({ status: 'expired', responded_at: new Date().toISOString() })
                .eq('league_team_id', teamId)
                .eq('status', 'pending');
            return { refundedPlayers };
        });
    }
    /**
     * Process all teams that should be disqualified (unpaid members past deadline).
     * Called by the scheduled job.
     */
    processTeamDeadlines() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const disqualified = [];
            // Find all team leagues that are active or in registration
            const { data: teamLeagues } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('format', 'team')
                .in('status', ['registration', 'active']);
            if (!teamLeagues || teamLeagues.length === 0)
                return { disqualified };
            for (const league of teamLeagues) {
                // Get the first week date/time as the deadline
                const { data: firstWeek } = yield database_1.supabase
                    .from('league_weeks')
                    .select('date')
                    .eq('league_id', league.id)
                    .order('week_number', { ascending: true })
                    .limit(1)
                    .single();
                if (!firstWeek)
                    continue;
                // Build deadline: first week date + league start_time
                const deadline = new Date(`${firstWeek.date}T${league.start_time}`);
                if (now < deadline)
                    continue; // Deadline hasn't passed yet
                // Find teams that are NOT 'active' and not already 'disqualified'/'withdrawn'
                const { data: teams } = yield database_1.supabase
                    .from('league_teams')
                    .select('*')
                    .eq('league_id', league.id)
                    .in('status', ['forming', 'pending_payment']);
                for (const team of (teams || [])) {
                    // Check if all members have paid
                    const { data: members } = yield database_1.supabase
                        .from('league_players')
                        .select('enrollment_status, season_paid')
                        .eq('league_team_id', team.id)
                        .neq('enrollment_status', 'withdrawn');
                    const allPaid = (members || []).length >= league.players_per_team &&
                        (members || []).every(m => m.enrollment_status === 'active' && m.season_paid);
                    if (!allPaid) {
                        try {
                            yield this.disqualifyTeam(team.id, 'Payment deadline passed');
                            disqualified.push(`${team.team_name} (league: ${league.name})`);
                        }
                        catch (err) {
                            console.error(`Failed to disqualify team ${team.id}:`, err.message);
                        }
                    }
                }
            }
            return { disqualified };
        });
    }
    /**
     * Get teams that the current user is on (for user dashboard).
     */
    getUserTeams(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all league_players for this user that are on teams
            const { data: players, error } = yield database_1.supabase
                .from('league_players')
                .select('*, league_teams(*, leagues(name, format, status, total_weeks, season_fee, weekly_prize_pot, start_time, num_holes, players_per_team, team_scoring_format))')
                .eq('user_id', userId)
                .neq('enrollment_status', 'withdrawn')
                .not('league_team_id', 'is', null);
            if (error) {
                throw new Error(`Failed to fetch user teams: ${error.message}`);
            }
            const results = [];
            for (const player of (players || [])) {
                const team = player.league_teams;
                const league = team === null || team === void 0 ? void 0 : team.leagues;
                if (!team || !league)
                    continue;
                // Get team members
                const { data: members } = yield database_1.supabase
                    .from('league_players')
                    .select('id, user_id, display_name, enrollment_status, season_paid')
                    .eq('league_team_id', team.id)
                    .neq('enrollment_status', 'withdrawn');
                // Get invites
                const { data: invites } = yield database_1.supabase
                    .from('league_team_invites')
                    .select('id, invited_email, status')
                    .eq('league_team_id', team.id);
                results.push({
                    teamId: team.id,
                    teamName: team.team_name,
                    teamStatus: team.status,
                    isCaptain: team.captain_user_id === userId,
                    playerId: player.id,
                    enrollmentStatus: player.enrollment_status,
                    seasonPaid: player.season_paid,
                    league: {
                        id: team.league_id,
                        name: league.name,
                        format: league.format,
                        status: league.status,
                        totalWeeks: league.total_weeks,
                        seasonFee: league.season_fee,
                        weeklyPrizePot: league.weekly_prize_pot,
                        numHoles: league.num_holes,
                        playersPerTeam: league.players_per_team,
                        teamScoringFormat: league.team_scoring_format,
                    },
                    members: (members || []).map(m => ({
                        playerId: m.id,
                        userId: m.user_id,
                        displayName: m.display_name,
                        enrollmentStatus: m.enrollment_status,
                        seasonPaid: m.season_paid,
                        isCaptain: m.user_id === team.captain_user_id,
                    })),
                    pendingInvites: (invites || []).filter(i => i.status === 'pending'),
                });
            }
            return results;
        });
    }
    // =====================================================
    // TEAM SCORING
    // =====================================================
    /**
     * Calculate team score for a week based on the scoring format.
     */
    calculateTeamScore(teamId, weekId, league) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all team member scores for this week
            const { data: members } = yield database_1.supabase
                .from('league_players')
                .select('id, current_handicap, display_name')
                .eq('league_team_id', teamId)
                .neq('enrollment_status', 'withdrawn');
            if (!members || members.length === 0) {
                return { teamGross: 0, teamNet: 0, memberScores: [] };
            }
            const memberIds = members.map(m => m.id);
            const { data: scores } = yield database_1.supabase
                .from('league_scores')
                .select('league_player_id, hole_number, strokes')
                .eq('league_week_id', weekId)
                .in('league_player_id', memberIds)
                .order('hole_number');
            if (!scores || scores.length === 0) {
                return { teamGross: 0, teamNet: 0, memberScores: [] };
            }
            // Organize scores by hole and player
            const scoresByHole = {};
            for (const s of scores) {
                if (!scoresByHole[s.hole_number]) {
                    scoresByHole[s.hole_number] = {};
                }
                scoresByHole[s.hole_number][s.league_player_id] = s.strokes;
            }
            const format = league.team_scoring_format || 'best_ball';
            let teamGross = 0;
            if (format === 'best_ball') {
                // Best score on each hole
                for (const hole of Object.keys(scoresByHole).map(Number)) {
                    const holeScores = Object.values(scoresByHole[hole]);
                    if (holeScores.length > 0) {
                        teamGross += Math.min(...holeScores);
                    }
                }
            }
            else if (format === 'combined') {
                // Sum all member scores
                teamGross = scores.reduce((sum, s) => sum + s.strokes, 0);
            }
            else if (format === 'scramble') {
                // In a scramble, all players should have the same score per hole
                // Use the first player's scores as the team score
                const firstMemberId = memberIds[0];
                const firstMemberScores = scores.filter(s => s.league_player_id === firstMemberId);
                teamGross = firstMemberScores.reduce((sum, s) => sum + s.strokes, 0);
            }
            // For net: use average team handicap
            const avgHandicap = members.reduce((sum, m) => sum + (m.current_handicap || 0), 0) / members.length;
            const teamNet = teamGross - avgHandicap;
            // Individual member scores for display
            const memberScores = members.map(m => {
                const playerScores = scores.filter(s => s.league_player_id === m.id);
                const gross = playerScores.reduce((sum, s) => sum + s.strokes, 0);
                return {
                    playerId: m.id,
                    displayName: m.display_name,
                    handicap: m.current_handicap,
                    gross,
                    net: gross - (m.current_handicap || 0),
                    holesCompleted: playerScores.length,
                };
            });
            return { teamGross, teamNet: Math.round(teamNet * 10) / 10, memberScores };
        });
    }
}
exports.LeagueService = LeagueService;
