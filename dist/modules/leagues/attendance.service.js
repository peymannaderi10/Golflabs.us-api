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
                console.error('Failed to fetch players for attendance generation:', playersError);
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
                console.error('Failed to generate attendance rows:', insertError);
                throw new Error(`Failed to generate attendance rows: ${insertError.message}`);
            }
            console.log(`Generated ${(inserted || []).length} attendance rows for week ${weekId}`);
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
     * Get attendance summary with counts and calculated bays needed.
     */
    getAttendanceSummary(weekId_1) {
        return __awaiter(this, arguments, void 0, function* (weekId, playersPerBay = 2) {
            const rows = yield this.getAttendanceForWeek(weekId);
            const confirmed = rows.filter(r => r.status === 'confirmed').length;
            const declined = rows.filter(r => r.status === 'declined').length;
            const noResponse = rows.filter(r => r.status === 'no_response').length;
            const locked = rows.length > 0 && rows[0].locked;
            const baysNeeded = confirmed > 0 ? Math.ceil(confirmed / playersPerBay) : 0;
            return {
                weekId,
                totalPlayers: rows.length,
                confirmed,
                declined,
                noResponse,
                baysNeeded,
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
                console.error('Failed to lock attendance:', error);
                throw new Error(`Failed to lock attendance: ${error.message}`);
            }
            console.log(`Attendance locked for week ${weekId}`);
        });
    }
    /**
     * Adjust capacity hold based on confirmed attendance.
     * Only called when attendance_auto_adjust = true.
     *
     * Logic:
     * 1. Get confirmed count and compute bays_needed = ceil(confirmed / players_per_bay)
     * 2. Compare with original hold — only REDUCE, never increase
     * 3. If confirmed === 0, suspend the hold entirely
     * 4. If bays_needed >= original reserved bays, leave unchanged
     */
    adjustCapacityHold(leagueId, weekId) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Get the league config
            const { data: league, error: leagueError } = yield database_1.supabase
                .from('leagues')
                .select('players_per_bay, capacity_hold_type, capacity_hold_value, location_id')
                .eq('id', leagueId)
                .single();
            if (leagueError || !league) {
                throw new Error('League not found for capacity adjustment.');
            }
            const playersPerBay = league.players_per_bay || 2;
            // 2. Get the attendance summary
            const summary = yield this.getAttendanceSummary(weekId, playersPerBay);
            // 3. Get the total number of bays at the location
            const { data: bays } = yield database_1.supabase
                .from('bays')
                .select('id')
                .eq('location_id', league.location_id);
            const totalBays = (bays === null || bays === void 0 ? void 0 : bays.length) || 0;
            // 4. Compute original reserved bays based on hold config
            let originalReservedBays;
            switch (league.capacity_hold_type) {
                case 'all_bays':
                    originalReservedBays = totalBays;
                    break;
                case 'num_bays':
                    originalReservedBays = league.capacity_hold_value;
                    break;
                case 'pct_capacity':
                    originalReservedBays = Math.ceil(totalBays * (league.capacity_hold_value / 100));
                    break;
                default:
                    originalReservedBays = totalBays;
            }
            // 5. If 0 confirmed, suspend the hold entirely
            if (summary.confirmed === 0) {
                yield this.suspendHoldForWeek(weekId);
                console.log(`Suspended hold for week ${weekId} — 0 confirmed players.`);
                return { adjusted: true, baysNeeded: 0, originalBays: originalReservedBays };
            }
            // 6. Compare: only reduce, never increase
            const baysNeeded = summary.baysNeeded;
            if (baysNeeded >= originalReservedBays) {
                console.log(`Hold for week ${weekId} unchanged — ${baysNeeded} bays needed >= ${originalReservedBays} original.`);
                return { adjusted: false, baysNeeded, originalBays: originalReservedBays };
            }
            // 7. Reduce the hold for this specific week
            yield this.updateHoldForWeek(weekId, baysNeeded);
            console.log(`Adjusted hold for week ${weekId}: ${originalReservedBays} -> ${baysNeeded} bays.`);
            return { adjusted: true, baysNeeded, originalBays: originalReservedBays };
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
                console.error('Failed to suspend hold for week:', error);
            }
        });
    }
    /**
     * Update a specific week's hold to a reduced number of bays.
     */
    updateHoldForWeek(weekId, baysNeeded) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({
                hold_type: 'num_bays',
                hold_value: baysNeeded,
                updated_at: new Date().toISOString(),
            })
                .eq('league_week_id', weekId)
                .eq('status', 'active');
            if (error) {
                console.error('Failed to update hold for week:', error);
                throw new Error(`Failed to update hold: ${error.message}`);
            }
        });
    }
}
exports.AttendanceService = AttendanceService;
