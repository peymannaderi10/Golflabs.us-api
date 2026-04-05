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
exports.AttendanceService = void 0;
const database_1 = require("../../config/database");
const capacity_hold_service_1 = require("../bookings/capacity-hold.service");
const logger_1 = require("../../shared/utils/logger");
class AttendanceService {
    constructor() {
        this.capacityHoldService = new capacity_hold_service_1.CapacityHoldService();
    }
    // =====================================================
    // Generate attendance rows
    // =====================================================
    /**
     * Create one league_attendance row per active player for a given week.
     * Idempotent — skips if rows already exist for the week.
     */
    generateAttendanceRows(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if rows already exist for this week
            const { data: existing } = yield database_1.supabase
                .from('league_attendance')
                .select('id')
                .eq('league_week_id', weekId)
                .limit(1);
            if (existing && existing.length > 0) {
                // Rows already generated
                const { data } = yield database_1.supabase
                    .from('league_attendance')
                    .select('*')
                    .eq('league_week_id', weekId);
                return (data || []);
            }
            // Get all active players for this league
            const { data: players, error: playersError } = yield database_1.supabase
                .from('league_players')
                .select('id, user_id')
                .eq('league_id', leagueId)
                .eq('enrollment_status', 'active');
            if (playersError) {
                logger_1.logger.error({ err: playersError }, 'Failed to fetch players for attendance generation');
                throw new Error(`Failed to fetch players: ${playersError.message}`);
            }
            if (!players || players.length === 0) {
                return [];
            }
            const rows = players.map((p) => ({
                league_id: leagueId,
                league_week_id: weekId,
                league_player_id: p.id,
                user_id: p.user_id,
                status: 'no_response',
            }));
            const { data: inserted, error: insertError } = yield database_1.supabase
                .from('league_attendance')
                .insert(rows)
                .select();
            if (insertError) {
                logger_1.logger.error({ err: insertError }, 'Failed to generate attendance rows');
                throw new Error(`Failed to generate attendance rows: ${insertError.message}`);
            }
            logger_1.logger.info({ count: (inserted || []).length, weekId }, 'Generated attendance rows for week');
            return (inserted || []);
        });
    }
    // =====================================================
    // Token-based confirm / decline (email one-click)
    // =====================================================
    /**
     * Confirm attendance via email token. Returns the updated row.
     */
    confirmAttendance(token) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.updateByToken(token, 'confirmed');
        });
    }
    /**
     * Decline attendance via email token.
     */
    declineAttendance(token) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.updateByToken(token, 'declined');
        });
    }
    updateByToken(token, status) {
        return __awaiter(this, void 0, void 0, function* () {
            // Look up the attendance row by token
            const { data: row, error: fetchError } = yield database_1.supabase
                .from('league_attendance')
                .select('*')
                .eq('confirmation_token', token)
                .single();
            if (fetchError || !row) {
                return { success: false, message: 'Invalid or expired confirmation link.' };
            }
            if (row.locked) {
                return { success: false, message: 'Attendance has already been locked for this week.' };
            }
            const { data: updated, error: updateError } = yield database_1.supabase
                .from('league_attendance')
                .update({
                status,
                responded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq('id', row.id)
                .select()
                .single();
            if (updateError) {
                return { success: false, message: 'Failed to update attendance.' };
            }
            // Live-adjust capacity hold based on updated attendance
            if (row.league_week_id) {
                const { data: week } = yield database_1.supabase
                    .from('league_weeks')
                    .select('league_id')
                    .eq('id', row.league_week_id)
                    .single();
                if (week === null || week === void 0 ? void 0 : week.league_id) {
                    this.liveAdjustCapacityHold(week.league_id, row.league_week_id).catch(err => logger_1.logger.error({ err, leagueId: week.league_id, weekId: row.league_week_id }, 'liveAdjustCapacityHold failed (non-fatal)'));
                }
            }
            return {
                success: true,
                message: status === 'confirmed' ? 'You\'re confirmed! See you on league night.' : 'Got it — you won\'t be attending this week.',
                attendance: updated,
            };
        });
    }
    // =====================================================
    // Auth-based update (from user dashboard)
    // =====================================================
    /**
     * Update attendance from the user dashboard (requires authentication).
     */
    updateAttendance(leaguePlayerId, weekId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if the row is locked
            const { data: row, error: fetchError } = yield database_1.supabase
                .from('league_attendance')
                .select('*')
                .eq('league_week_id', weekId)
                .eq('league_player_id', leaguePlayerId)
                .single();
            if (fetchError || !row) {
                throw new Error('Attendance record not found for this week.');
            }
            if (row.locked) {
                throw new Error('Attendance has been locked for this week.');
            }
            const { data: updated, error: updateError } = yield database_1.supabase
                .from('league_attendance')
                .update({
                status,
                responded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq('id', row.id)
                .select()
                .single();
            if (updateError) {
                throw new Error(`Failed to update attendance: ${updateError.message}`);
            }
            // Live-adjust capacity hold based on updated attendance
            const { data: week } = yield database_1.supabase
                .from('league_weeks')
                .select('league_id')
                .eq('id', weekId)
                .single();
            if (week === null || week === void 0 ? void 0 : week.league_id) {
                this.liveAdjustCapacityHold(week.league_id, weekId).catch(err => logger_1.logger.error({ err, leagueId: week.league_id, weekId }, 'liveAdjustCapacityHold failed (non-fatal)'));
            }
            return updated;
        });
    }
    // =====================================================
    // Queries
    // =====================================================
    /**
     * Get all attendance rows for a week, with player names.
     */
    getAttendanceForWeek(weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_attendance')
                .select('*, league_players(display_name, league_team_id, league_teams(team_name))')
                .eq('league_week_id', weekId)
                .order('created_at');
            if (error) {
                throw new Error(`Failed to fetch attendance: ${error.message}`);
            }
            return (data || []).map((row) => {
                var _a, _b, _c, _d;
                return (Object.assign(Object.assign({}, row), { display_name: ((_a = row.league_players) === null || _a === void 0 ? void 0 : _a.display_name) || 'Unknown', league_team_id: ((_b = row.league_players) === null || _b === void 0 ? void 0 : _b.league_team_id) || null, team_name: ((_d = (_c = row.league_players) === null || _c === void 0 ? void 0 : _c.league_teams) === null || _d === void 0 ? void 0 : _d.team_name) || undefined }));
            });
        });
    }
    /**
     * Get attendance summary with counts and calculated spaces needed.
     */
    getAttendanceSummary(weekId_1) {
        return __awaiter(this, arguments, void 0, function* (weekId, playersPerSpace = 2) {
            const rows = yield this.getAttendanceForWeek(weekId);
            const confirmed = rows.filter(r => r.status === 'confirmed').length;
            const declined = rows.filter(r => r.status === 'declined').length;
            const noResponse = rows.filter(r => r.status === 'no_response').length;
            const locked = rows.length > 0 && rows[0].locked;
            const spacesNeeded = confirmed > 0 ? Math.ceil(confirmed / playersPerSpace) : 0;
            return {
                weekId,
                totalPlayers: rows.length,
                confirmed,
                declined,
                noResponse,
                spacesNeeded,
                locked,
            };
        });
    }
    /**
     * Get a player's attendance status across all weeks for a league.
     */
    getPlayerAttendance(userId, leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('league_attendance')
                .select('*, league_weeks(week_number, date, status)')
                .eq('league_id', leagueId)
                .eq('user_id', userId)
                .order('created_at');
            if (error) {
                throw new Error(`Failed to fetch player attendance: ${error.message}`);
            }
            return (data || []);
        });
    }
    // =====================================================
    // Lock & Adjust
    // =====================================================
    /**
     * Lock attendance for a week — no further changes allowed.
     */
    lockAttendance(weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('league_attendance')
                .update({ locked: true, updated_at: new Date().toISOString() })
                .eq('league_week_id', weekId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Failed to lock attendance');
                throw new Error(`Failed to lock attendance: ${error.message}`);
            }
            logger_1.logger.info({ weekId }, 'Attendance locked for week');
        });
    }
    /**
     * Live-adjust capacity hold as players respond (confirm/decline).
     * Counts confirmed + no_response as potential attendees (they might still show up).
     * Only reduces the hold, never increases beyond the original.
     */
    liveAdjustCapacityHold(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { data: league } = yield database_1.supabase
                    .from('leagues')
                    .select('attendance_auto_adjust, players_per_space, capacity_hold_type, capacity_hold_value, location_id')
                    .eq('id', leagueId)
                    .single();
                if (!league || !league.attendance_auto_adjust)
                    return;
                const playersPerSpace = league.players_per_space || 2;
                const rows = yield this.getAttendanceForWeek(weekId);
                // Count confirmed + no_response as potential attendees
                const potentialAttendees = rows.filter(r => r.status === 'confirmed' || r.status === 'no_response').length;
                const spacesNeeded = potentialAttendees > 0 ? Math.ceil(potentialAttendees / playersPerSpace) : 0;
                // Get total spaces at location
                const { data: spaces } = yield database_1.supabase
                    .from('spaces')
                    .select('id')
                    .eq('location_id', league.location_id)
                    .is('deleted_at', null);
                const totalSpaces = (spaces === null || spaces === void 0 ? void 0 : spaces.length) || 0;
                // Compute original reserved spaces
                let originalReservedSpaces;
                switch (league.capacity_hold_type) {
                    case 'all_spaces':
                        originalReservedSpaces = totalSpaces;
                        break;
                    case 'num_spaces':
                        originalReservedSpaces = league.capacity_hold_value;
                        break;
                    default: originalReservedSpaces = totalSpaces;
                }
                if (potentialAttendees === 0) {
                    yield this.suspendHoldForWeek(weekId);
                    logger_1.logger.info({ weekId, leagueId }, 'Live-adjust: suspended hold (0 potential attendees)');
                    return;
                }
                // Only reduce, never increase beyond original
                if (spacesNeeded < originalReservedSpaces) {
                    yield this.updateHoldForWeek(weekId, spacesNeeded);
                    logger_1.logger.info({ weekId, leagueId, spacesNeeded, originalReservedSpaces }, 'Live-adjust: reduced hold');
                }
            }
            catch (err) {
                logger_1.logger.error({ err, leagueId, weekId }, 'Error in live capacity adjustment');
                // Don't throw — this is a best-effort optimization
            }
        });
    }
    /**
     * Final capacity adjustment at cutoff time.
     * Only counts confirmed players (no_response = not coming).
     * Only reduces the hold, never increases beyond the original.
     */
    adjustCapacityHold(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Get the league config
            const { data: league, error: leagueError } = yield database_1.supabase
                .from('leagues')
                .select('players_per_space, capacity_hold_type, capacity_hold_value, location_id')
                .eq('id', leagueId)
                .single();
            if (leagueError || !league) {
                throw new Error('League not found for capacity adjustment.');
            }
            const playersPerSpace = league.players_per_space || 2;
            // 2. Get the attendance summary
            const summary = yield this.getAttendanceSummary(weekId, playersPerSpace);
            // 3. Get the total number of spaces at the location
            const { data: spaces } = yield database_1.supabase
                .from('spaces')
                .select('id')
                .eq('location_id', league.location_id)
                .is('deleted_at', null);
            const totalSpaces = (spaces === null || spaces === void 0 ? void 0 : spaces.length) || 0;
            // 4. Compute original reserved spaces based on hold config
            let originalReservedSpaces;
            switch (league.capacity_hold_type) {
                case 'all_spaces':
                    originalReservedSpaces = totalSpaces;
                    break;
                case 'num_spaces':
                    originalReservedSpaces = league.capacity_hold_value;
                    break;
                case 'pct_capacity':
                    originalReservedSpaces = Math.ceil(totalSpaces * (league.capacity_hold_value / 100));
                    break;
                default:
                    originalReservedSpaces = totalSpaces;
            }
            // 5. If 0 confirmed, suspend the hold entirely
            if (summary.confirmed === 0) {
                yield this.suspendHoldForWeek(weekId);
                logger_1.logger.info({ weekId }, 'Suspended hold for week - 0 confirmed players');
                return { adjusted: true, spacesNeeded: 0, originalSpaces: originalReservedSpaces };
            }
            // 6. Compare: only reduce, never increase
            const spacesNeeded = summary.spacesNeeded;
            if (spacesNeeded >= originalReservedSpaces) {
                logger_1.logger.info({ weekId, spacesNeeded, originalReservedSpaces }, 'Hold for week unchanged - spaces needed >= original');
                return { adjusted: false, spacesNeeded, originalSpaces: originalReservedSpaces };
            }
            // 7. Reduce the hold for this specific week
            yield this.updateHoldForWeek(weekId, spacesNeeded);
            logger_1.logger.info({ weekId, originalReservedSpaces, spacesNeeded }, 'Adjusted hold for week');
            return { adjusted: true, spacesNeeded, originalSpaces: originalReservedSpaces };
        });
    }
    // =====================================================
    // Team-specific
    // =====================================================
    /**
     * Get attendance summary per team for a week.
     */
    getTeamAttendanceSummary(weekId, teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield this.getAttendanceForWeek(weekId);
            const teamRows = rows.filter(r => r.league_team_id === teamId);
            const confirmed = teamRows.filter(r => r.status === 'confirmed').length;
            return { confirmed, total: teamRows.length };
        });
    }
    // =====================================================
    // Private helpers
    // =====================================================
    /**
     * Suspend a hold row for a specific week (0 confirmed).
     */
    suspendHoldForWeek(weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({ status: 'suspended', updated_at: new Date().toISOString() })
                .eq('league_week_id', weekId)
                .eq('status', 'active');
            if (error) {
                logger_1.logger.error({ err: error }, 'Failed to suspend hold for week');
            }
        });
    }
    /**
     * Update a specific week's hold to a reduced number of spaces.
     */
    updateHoldForWeek(weekId, spacesNeeded) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({
                hold_type: 'num_spaces',
                hold_value: spacesNeeded,
                updated_at: new Date().toISOString(),
            })
                .eq('league_week_id', weekId)
                .eq('status', 'active');
            if (error) {
                logger_1.logger.error({ err: error }, 'Failed to update hold for week');
                throw new Error(`Failed to update hold: ${error.message}`);
            }
        });
    }
}
exports.AttendanceService = AttendanceService;
