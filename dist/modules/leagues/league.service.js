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
const capacity_hold_service_1 = require("../bookings/capacity-hold.service");
const date_utils_1 = require("../../shared/utils/date.utils");
const date_fns_tz_1 = require("date-fns-tz");
const schedule_generator_1 = require("./schedule-generator");
const logger_1 = require("../../shared/utils/logger");
// Sub-service imports (facade delegates)
const league_enrollment_service_1 = require("./league-enrollment.service");
const league_course_service_1 = require("./league-course.service");
const league_scoring_service_1 = require("./league-scoring.service");
const league_standings_service_1 = require("./league-standings.service");
const league_prize_service_1 = require("./league-prize.service");
const league_team_service_1 = require("./league-team.service");
class LeagueService {
    constructor() {
        this.capacityHoldService = new capacity_hold_service_1.CapacityHoldService();
        this.enrollmentService = new league_enrollment_service_1.LeagueEnrollmentService();
        this.courseService = new league_course_service_1.LeagueCourseService();
        this.standingsService = new league_standings_service_1.LeagueStandingsService();
        this.prizeService = new league_prize_service_1.LeaguePrizeService();
        this.teamService = new league_team_service_1.LeagueTeamService();
        // Scoring service needs standings, prize, and course services for finalizeWeek orchestration
        this.scoringService = new league_scoring_service_1.LeagueScoringService(this.standingsService, this.prizeService, this.courseService);
    }
    // =====================================================
    // LEAGUE CRUD (stays in facade)
    // =====================================================
    getCourseCatalog() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('golf_course_catalog')
                .select('id, name, location, country, num_holes, total_par, hole_pars')
                .order('name');
            if (error) {
                throw new Error(`Failed to fetch course catalog: ${error.message}`);
            }
            return data || [];
        });
    }
    createLeague(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { locationId, name, format = 'stroke_play', numHoles = 9, parPerHole = 3, seasonFee = 0, membersOnly = false, maxPlayers = 32, handicapEnabled = true, courseRotation = 'fixed', scoringType = 'net_stroke_play', pointsConfig, courses, scheduleConfig, prizePoolConfig, playersPerTeam = 2, teamScoringFormat = 'best_ball', capacityHoldType = 'all_spaces', capacityHoldValue = 100, leagueSpaceIds = [], bufferBeforeMins = 0, bufferAfterMins = 0, attendanceRequired = false, attendanceAutoAdjust = false, attendanceReminderHours = 24, attendanceCutoffHours = 8, playersPerSpace = 2, teamMinAttendance = null, } = data;
            // Validate space count for num_spaces hold type
            if (capacityHoldType === 'num_spaces') {
                const { count: spaceCount } = yield database_1.supabase
                    .from('spaces')
                    .select('id', { count: 'exact', head: true })
                    .eq('location_id', locationId)
                    .is('deleted_at', null);
                if (spaceCount !== null && capacityHoldValue > spaceCount) {
                    throw new Error(`Cannot reserve ${capacityHoldValue} spaces — this location only has ${spaceCount}`);
                }
            }
            // Generate sessions from schedule config
            const generatedSessions = (0, schedule_generator_1.generateSessionDates)(scheduleConfig);
            if (generatedSessions.length === 0) {
                throw new Error('Schedule config generated 0 sessions');
            }
            // Validate earliest session is at least 3 days out (blocks past dates + next 2 days)
            const minDate = new Date();
            minDate.setDate(minDate.getDate() + 3);
            minDate.setHours(0, 0, 0, 0);
            const earliestSession = new Date(generatedSessions[0].date + 'T00:00:00');
            if (earliestSession < minDate) {
                throw new Error('League sessions must start at least 3 days from today');
            }
            const totalWeeks = generatedSessions.length;
            const primaryDayOfWeek = scheduleConfig.daysOfWeek[0];
            const weeklyPrizePot = (prizePoolConfig === null || prizePoolConfig === void 0 ? void 0 : prizePoolConfig.enabled) ? prizePoolConfig.buyInPerSession : 0;
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
                day_of_week: primaryDayOfWeek,
                start_time: scheduleConfig.startTime,
                end_time: scheduleConfig.endTime,
                season_fee: seasonFee,
                members_only: membersOnly,
                weekly_prize_pot: weeklyPrizePot,
                max_players: maxPlayers,
                handicap_enabled: handicapEnabled,
                course_rotation: courseRotation,
                scoring_type: scoringType,
                points_config: pointsConfig || null,
                payout_config: null,
                schedule_config: scheduleConfig,
                prize_pool_config: prizePoolConfig || null,
                players_per_team: format === 'team' ? playersPerTeam : 2,
                team_scoring_format: format === 'team' ? teamScoringFormat : 'best_ball',
                capacity_hold_type: capacityHoldType,
                capacity_hold_value: capacityHoldValue,
                league_space_ids: leagueSpaceIds,
                buffer_before_mins: bufferBeforeMins,
                buffer_after_mins: bufferAfterMins,
                attendance_required: attendanceRequired,
                attendance_auto_adjust: attendanceAutoAdjust,
                attendance_reminder_hours: attendanceReminderHours,
                attendance_cutoff_hours: attendanceCutoffHours,
                players_per_space: playersPerSpace,
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
                    logger_1.logger.error({ err: coursesError }, 'Failed to create league courses');
                }
                else {
                    createdCourses = coursesData || [];
                }
            }
            // Auto-generate league_weeks rows from schedule config
            const weeks = [];
            for (const session of generatedSessions) {
                let courseId = null;
                if (createdCourses.length > 0) {
                    if (courseRotation === 'fixed') {
                        const defaultCourse = createdCourses.find(c => c.is_default) || createdCourses[0];
                        courseId = defaultCourse.id;
                    }
                    else {
                        courseId = createdCourses[(session.sessionNumber - 1) % createdCourses.length].id;
                    }
                }
                weeks.push({
                    league_id: league.id,
                    week_number: session.sessionNumber,
                    date: session.date,
                    status: 'upcoming',
                    league_course_id: courseId,
                    session_label: session.sessionLabel,
                });
            }
            const { data: weeksData, error: weeksError } = yield database_1.supabase
                .from('league_weeks')
                .insert(weeks)
                .select('id, date');
            if (weeksError) {
                logger_1.logger.error({ err: weeksError }, 'Failed to create league weeks');
            }
            // Capacity holds are generated when the league is activated, not at creation.
            // This allows draft leagues to coexist with bookings until explicitly activated.
            return league;
        });
    }
    getLeaguesByLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .select('*')
                .eq('location_id', locationId)
                .is('deleted_at', null)
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
                .is('deleted_at', null)
                .single();
            if (error || !data) {
                throw new Error(`League not found: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            return data;
        });
    }
    deleteLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.cancelLeague(leagueId);
            return { success: true };
        });
    }
    updateLeague(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
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
            if (data.maxPlayers !== undefined)
                updateData.max_players = data.maxPlayers;
            if (data.handicapEnabled !== undefined)
                updateData.handicap_enabled = data.handicapEnabled;
            if (data.courseRotation !== undefined)
                updateData.course_rotation = data.courseRotation;
            if (data.scoringType !== undefined)
                updateData.scoring_type = data.scoringType;
            if (data.pointsConfig !== undefined)
                updateData.points_config = data.pointsConfig;
            if (data.playersPerTeam !== undefined)
                updateData.players_per_team = data.playersPerTeam;
            if (data.teamScoringFormat !== undefined)
                updateData.team_scoring_format = data.teamScoringFormat;
            if (data.capacityHoldType !== undefined)
                updateData.capacity_hold_type = data.capacityHoldType;
            if (data.capacityHoldValue !== undefined)
                updateData.capacity_hold_value = data.capacityHoldValue;
            if (data.leagueSpaceIds !== undefined)
                updateData.league_space_ids = data.leagueSpaceIds;
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
            if (data.playersPerSpace !== undefined)
                updateData.players_per_space = data.playersPerSpace;
            if (data.teamMinAttendance !== undefined)
                updateData.team_min_attendance = data.teamMinAttendance;
            if (data.scheduleConfig !== undefined) {
                updateData.schedule_config = data.scheduleConfig;
                updateData.start_time = data.scheduleConfig.startTime;
                updateData.end_time = data.scheduleConfig.endTime;
                updateData.day_of_week = data.scheduleConfig.daysOfWeek[0];
            }
            if (data.prizePoolConfig !== undefined) {
                updateData.prize_pool_config = data.prizePoolConfig;
                updateData.weekly_prize_pot = ((_a = data.prizePoolConfig) === null || _a === void 0 ? void 0 : _a.enabled) ? data.prizePoolConfig.buyInPerSession : 0;
            }
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
                        holdType: league.capacity_hold_type || 'all_spaces',
                        holdValue: league.capacity_hold_value || 100,
                        bufferBeforeMins: league.buffer_before_mins || 0,
                        bufferAfterMins: league.buffer_after_mins || 0,
                    });
                }
                catch (holdError) {
                    logger_1.logger.error({ err: holdError }, 'Failed to update capacity holds');
                }
            }
            return league;
        });
    }
    cancelLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: league, error } = yield database_1.supabase
                .from('leagues')
                .update({
                status: 'cancelled',
                deleted_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq('id', leagueId)
                .is('deleted_at', null)
                .select()
                .single();
            if (error || !league) {
                throw new Error(`League not found or already deleted: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            try {
                yield this.capacityHoldService.releaseHoldsForLeague(leagueId);
            }
            catch (holdError) {
                logger_1.logger.error({ err: holdError }, 'Failed to release capacity holds');
            }
            return league;
        });
    }
    checkLeagueBookingConflicts(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            // Get location timezone
            const { data: location, error: locError } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', league.location_id)
                .single();
            if (locError || !location) {
                throw new Error(`Failed to fetch location: ${locError === null || locError === void 0 ? void 0 : locError.message}`);
            }
            const timezone = location.timezone || 'America/New_York';
            // Get all league weeks
            const { data: weeks, error: weeksError } = yield database_1.supabase
                .from('league_weeks')
                .select('week_number, date')
                .eq('league_id', leagueId)
                .order('week_number');
            if (weeksError || !weeks) {
                throw new Error(`Failed to fetch league weeks: ${weeksError === null || weeksError === void 0 ? void 0 : weeksError.message}`);
            }
            // Get all spaces at the location
            const { data: allSpaces } = yield database_1.supabase
                .from('spaces')
                .select('id, space_number')
                .eq('location_id', league.location_id)
                .is('deleted_at', null)
                .order('space_number');
            const totalSpaces = (allSpaces === null || allSpaces === void 0 ? void 0 : allSpaces.length) || 0;
            const spacesNeeded = Math.ceil((league.max_players || 32) / (league.players_per_space || 2));
            const allSpaceIds = (allSpaces || []).map((s) => s.id);
            const conflicts = [];
            for (const week of weeks) {
                // Expand the conflict window by buffer times to match what the booking grid will block
                const leagueStartDate = new Date((0, date_utils_1.createISOTimestamp)(week.date, league.start_time, timezone));
                const leagueEndDate = new Date((0, date_utils_1.createISOTimestamp)(week.date, league.end_time, timezone));
                leagueStartDate.setMinutes(leagueStartDate.getMinutes() - (league.buffer_before_mins || 0));
                leagueEndDate.setMinutes(leagueEndDate.getMinutes() + (league.buffer_after_mins || 0));
                const leagueStartISO = leagueStartDate.toISOString();
                const leagueEndISO = leagueEndDate.toISOString();
                const { data: conflictingBookings, error: bookingsError } = yield database_1.supabase
                    .from('bookings')
                    .select('id, space_id, start_time, end_time, user_profiles(full_name), spaces(name)')
                    .eq('location_id', league.location_id)
                    .in('status', ['confirmed', 'reserved'])
                    .lt('start_time', leagueEndISO)
                    .gt('end_time', leagueStartISO);
                if (bookingsError) {
                    logger_1.logger.error({ err: bookingsError, weekDate: week.date }, 'Error checking booking conflicts');
                    continue;
                }
                if (!conflictingBookings || conflictingBookings.length === 0) {
                    continue;
                }
                // Count how many spaces have bookings during this window
                const bookedSpaceIds = new Set(conflictingBookings.map((b) => b.space_id));
                const freeSpaces = totalSpaces - bookedSpaceIds.size;
                // Only a conflict if there aren't enough free spaces for the league to claim
                if (freeSpaces < spacesNeeded) {
                    conflicts.push({
                        weekNumber: week.week_number,
                        date: week.date,
                        conflictingBookings: conflictingBookings.map((b) => {
                            var _a, _b;
                            const localStart = (0, date_fns_tz_1.toZonedTime)(new Date(b.start_time), timezone);
                            const localEnd = (0, date_fns_tz_1.toZonedTime)(new Date(b.end_time), timezone);
                            return {
                                id: b.id,
                                spaceName: ((_a = b.spaces) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown',
                                startTime: (0, date_fns_tz_1.format)(localStart, 'h:mm a', { timeZone: timezone }),
                                endTime: (0, date_fns_tz_1.format)(localEnd, 'h:mm a', { timeZone: timezone }),
                                customerName: ((_b = b.user_profiles) === null || _b === void 0 ? void 0 : _b.full_name) || 'Unknown',
                            };
                        }),
                    });
                }
            }
            return {
                hasConflicts: conflicts.length > 0,
                conflicts,
            };
        });
    }
    activateLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.status !== 'draft' && league.status !== 'registration') {
                throw new Error(`Cannot activate league in '${league.status}' status`);
            }
            // Check for booking conflicts before activating
            const conflictCheck = yield this.checkLeagueBookingConflicts(leagueId);
            if (conflictCheck.hasConflicts) {
                return { conflicts: conflictCheck.conflicts };
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
            // Generate capacity holds now that the league is active
            try {
                const { data: weeks } = yield database_1.supabase
                    .from('league_weeks')
                    .select('id, date')
                    .eq('league_id', leagueId)
                    .order('week_number');
                if (weeks && weeks.length > 0) {
                    const scheduleConfig = league.schedule_config;
                    yield this.capacityHoldService.generateHoldsForLeague(leagueId, league.location_id, scheduleConfig.startTime, scheduleConfig.endTime, weeks.map((w) => ({ id: w.id, date: w.date })), {
                        holdType: league.capacity_hold_type,
                        holdValue: league.capacity_hold_value,
                        bufferBeforeMins: league.buffer_before_mins,
                        bufferAfterMins: league.buffer_after_mins,
                    }, { maxPlayers: league.max_players, playersPerSpace: league.players_per_space });
                }
            }
            catch (holdError) {
                logger_1.logger.error({ err: holdError }, 'Failed to generate capacity holds on activation');
            }
            return data;
        });
    }
    completeLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            if (league.status !== 'active') {
                throw new Error(`Cannot complete league in '${league.status}' status`);
            }
            // Verify all weeks are finalized
            const { count: remaining } = yield database_1.supabase
                .from('league_weeks')
                .select('id', { count: 'exact', head: true })
                .eq('league_id', leagueId)
                .neq('status', 'finalized');
            if (remaining && remaining > 0) {
                throw new Error(`Cannot complete league — ${remaining} week(s) are not finalized`);
            }
            const { data, error } = yield database_1.supabase
                .from('leagues')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', leagueId)
                .select()
                .single();
            if (error || !data) {
                throw new Error(`Failed to complete league: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            try {
                yield this.capacityHoldService.releaseHoldsForLeague(leagueId);
            }
            catch (holdError) {
                logger_1.logger.error({ err: holdError }, 'Failed to release capacity holds');
            }
            return data;
        });
    }
    getLeagueLocationId(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data } = yield database_1.supabase
                .from('leagues')
                .select('location_id')
                .eq('id', leagueId)
                .single();
            return (_a = data === null || data === void 0 ? void 0 : data.location_id) !== null && _a !== void 0 ? _a : null;
        });
    }
    getActivePlayerIdForUser(userId, leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data } = yield database_1.supabase
                .from('league_players')
                .select('id')
                .eq('user_id', userId)
                .eq('league_id', leagueId)
                .neq('enrollment_status', 'withdrawn')
                .order('joined_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            return (_a = data === null || data === void 0 ? void 0 : data.id) !== null && _a !== void 0 ? _a : null;
        });
    }
    // =====================================================
    // USER-FACING QUERIES (stays in facade)
    // =====================================================
    getLeaguesForUser(userId) {
        return __awaiter(this, void 0, void 0, function* () {
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
            // Batch fetch standings and next weeks to avoid N+1
            const validEnrollments = enrollments.filter(e => e.leagues && !e.leagues.deleted_at);
            const playerIds = validEnrollments.map(e => e.id);
            const leagueIds = [...new Set(validEnrollments.map(e => e.leagues.id))];
            const [{ data: allStandings }, { data: allWeeks }] = yield Promise.all([
                database_1.supabase.from('league_standings').select('*').in('league_player_id', playerIds),
                database_1.supabase.from('league_weeks').select('id, league_id, week_number, date, status')
                    .in('league_id', leagueIds).in('status', ['upcoming', 'active']).order('week_number'),
            ]);
            const standingsMap = new Map((allStandings || []).map((s) => [s.league_player_id, s]));
            const nextWeekMap = new Map();
            for (const w of (allWeeks || [])) {
                if (!nextWeekMap.has(w.league_id))
                    nextWeekMap.set(w.league_id, w);
            }
            const results = [];
            for (const enrollment of validEnrollments) {
                const league = enrollment.leagues;
                const standing = standingsMap.get(enrollment.id) || null;
                const nextWeek = nextWeekMap.get(league.id) || null;
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
    getLeagueStateForKiosk(leagueId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const league = yield this.getLeague(leagueId);
            const { data: activeWeek } = yield database_1.supabase
                .from('league_weeks')
                .select('*, league_courses(id, course_name, num_holes, hole_pars, total_par)')
                .eq('league_id', leagueId)
                .in('status', ['active', 'scoring'])
                .order('week_number', { ascending: false })
                .limit(1)
                .single();
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
            const courseData = activeWeek === null || activeWeek === void 0 ? void 0 : activeWeek.league_courses;
            let teammates = null;
            if (player && player.league_team_id && activeWeek) {
                const { data: teamPlayers } = yield database_1.supabase
                    .from('league_players')
                    .select('id, display_name, current_handicap')
                    .eq('league_team_id', player.league_team_id)
                    .neq('enrollment_status', 'withdrawn')
                    .order('display_name');
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
    // DELEGATED METHODS — Enrollment
    // =====================================================
    enrollPlayer(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.enrollPlayer(leagueId, data);
        });
    }
    getPlayers(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.getPlayers(leagueId);
        });
    }
    searchPlayers(leagueId, query) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.searchPlayers(leagueId, query);
        });
    }
    refundWeeklyBuyIn(leagueId, playerId, reason, issuedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.refundWeeklyBuyIn(leagueId, playerId, reason, issuedBy);
        });
    }
    removeAndRefund(leagueId, playerId, refundType, reason, issuedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.removeAndRefund(leagueId, playerId, refundType, reason, issuedBy);
        });
    }
    withdrawPlayer(leagueId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.withdrawPlayer(leagueId, playerId);
        });
    }
    enrollAndPay(leagueId_1, userId_1, displayName_1) {
        return __awaiter(this, arguments, void 0, function* (leagueId, userId, displayName, initialHandicap = 0) {
            return this.enrollmentService.enrollAndPay(leagueId, userId, displayName, initialHandicap);
        });
    }
    overrideHandicap(leagueId, playerId, newHandicap, overriddenBy, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.enrollmentService.overrideHandicap(leagueId, playerId, newHandicap, overriddenBy, reason);
        });
    }
    // =====================================================
    // DELEGATED METHODS — Courses
    // =====================================================
    addCourse(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.courseService.addCourse(leagueId, data);
        });
    }
    getCourses(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.courseService.getCourses(leagueId);
        });
    }
    updateCourse(courseId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.courseService.updateCourse(courseId, data);
        });
    }
    deleteCourse(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.courseService.deleteCourse(courseId);
        });
    }
    assignCourseToWeek(weekId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.courseService.assignCourseToWeek(weekId, courseId);
        });
    }
    // =====================================================
    // DELEGATED METHODS — Scoring & Weeks
    // =====================================================
    getWeeks(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.getWeeks(leagueId);
        });
    }
    activateWeek(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.activateWeek(leagueId, weekId);
        });
    }
    finalizeWeek(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.finalizeWeek(leagueId, weekId);
        });
    }
    validateScoreSubmission(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.validateScoreSubmission(data);
        });
    }
    submitScore(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.submitScore(data);
        });
    }
    submitScoresBulk(leagueId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.submitScoresBulk(leagueId, data);
        });
    }
    getWeekScores(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.getWeekScores(leagueId, weekId);
        });
    }
    getPlayerScorecard(leagueId, weekId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.getPlayerScorecard(leagueId, weekId, playerId);
        });
    }
    confirmScore(scoreId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.confirmScore(scoreId, confirmedBy);
        });
    }
    confirmWeekScores(weekId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.confirmWeekScores(weekId, confirmedBy);
        });
    }
    overrideScore(scoreId, newStrokes, overriddenBy, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.scoringService.overrideScore(scoreId, newStrokes, overriddenBy, reason);
        });
    }
    // =====================================================
    // DELEGATED METHODS — Standings & Leaderboards
    // =====================================================
    getStandings(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.standingsService.getStandings(leagueId);
        });
    }
    getLiveLeaderboard(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.standingsService.getLiveLeaderboard(leagueId);
        });
    }
    getTeamLeaderboard(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.standingsService.getTeamLeaderboard(leagueId);
        });
    }
    recalculateHandicaps(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.standingsService.recalculateHandicaps(leagueId, weekId);
        });
    }
    // =====================================================
    // DELEGATED METHODS — Prize Pool
    // =====================================================
    calculateWeeklyPot(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.calculateWeeklyPot(leagueId, weekId);
        });
    }
    generateWeekPayouts(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.generateWeekPayouts(leagueId, weekId);
        });
    }
    confirmPayout(ledgerEntryId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.confirmPayout(ledgerEntryId, confirmedBy);
        });
    }
    confirmWeekPayouts(leagueId, weekId, confirmedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.confirmWeekPayouts(leagueId, weekId, confirmedBy);
        });
    }
    getPrizePoolSummary(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.getPrizePoolSummary(leagueId);
        });
    }
    getPlayerPrizeHistory(leagueId, playerId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.getPlayerPrizeHistory(leagueId, playerId);
        });
    }
    insertPrizeContribution(leagueId, leaguePlayerId, amount, description) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.prizeService.insertPrizeContribution(leagueId, leaguePlayerId, amount, description);
        });
    }
    // =====================================================
    // DELEGATED METHODS — Teams
    // =====================================================
    createTeam(leagueId, captainUserId, teamName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.createTeam(leagueId, captainUserId, teamName);
        });
    }
    inviteTeammates(teamId, captainUserId, emails) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.inviteTeammates(teamId, captainUserId, emails);
        });
    }
    acceptInvite(inviteToken, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.acceptInvite(inviteToken, userId);
        });
    }
    declineInvite(inviteToken, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.declineInvite(inviteToken, userId);
        });
    }
    getInviteByToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.getInviteByToken(token);
        });
    }
    getTeams(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.getTeams(leagueId);
        });
    }
    getTeam(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.getTeam(teamId);
        });
    }
    enrollTeamPlayer(leagueId_1, teamId_1, userId_1, displayName_1) {
        return __awaiter(this, arguments, void 0, function* (leagueId, teamId, userId, displayName, initialHandicap = 0) {
            return this.teamService.enrollTeamPlayer(leagueId, teamId, userId, displayName, initialHandicap);
        });
    }
    checkTeamAllPaid(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.checkTeamAllPaid(teamId);
        });
    }
    disqualifyTeam(teamId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.disqualifyTeam(teamId, reason);
        });
    }
    processTeamDeadlines() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.processTeamDeadlines();
        });
    }
    getUserTeams(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.getUserTeams(userId);
        });
    }
    calculateTeamScore(teamId, weekId, league) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.teamService.calculateTeamScore(teamId, weekId, league);
        });
    }
}
exports.LeagueService = LeagueService;
