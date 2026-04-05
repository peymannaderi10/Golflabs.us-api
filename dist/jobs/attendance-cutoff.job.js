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
exports.processAttendanceCutoffs = processAttendanceCutoffs;
const database_1 = require("../config/database");
const attendance_service_1 = require("../modules/leagues/attendance.service");
const logger_1 = require("../shared/utils/logger");
const attendanceService = new attendance_service_1.AttendanceService();
/**
 * Attendance Cutoff Job
 *
 * Runs every 5 minutes. For each league with attendance_required = true:
 * 1. Finds weeks where attendance rows exist but are not yet locked
 * 2. If now >= cutoff_time, locks attendance
 * 3. If attendance_auto_adjust = true, adjusts capacity hold based on confirmed count
 *
 * cutoff_time = week.date + league.start_time - attendance_cutoff_hours
 */
function processAttendanceCutoffs() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. Get all active leagues with attendance enabled
            const { data: leagues, error } = yield database_1.supabase
                .from('leagues')
                .select('id, name, start_time, attendance_cutoff_hours, attendance_auto_adjust, players_per_space, team_min_attendance, format')
                .eq('attendance_required', true)
                .in('status', ['active', 'registration']);
            if (error || !leagues || leagues.length === 0)
                return;
            const now = new Date();
            for (const league of leagues) {
                try {
                    // 2. Find weeks with unlocked attendance rows
                    const { data: weeks } = yield database_1.supabase
                        .from('league_weeks')
                        .select('id, week_number, date, status')
                        .eq('league_id', league.id)
                        .in('status', ['upcoming', 'active']);
                    if (!weeks || weeks.length === 0)
                        continue;
                    for (const week of weeks) {
                        try {
                            // Check if attendance rows exist and are unlocked
                            const { data: attendanceRows } = yield database_1.supabase
                                .from('league_attendance')
                                .select('id, locked')
                                .eq('league_week_id', week.id)
                                .limit(1);
                            if (!attendanceRows || attendanceRows.length === 0)
                                continue;
                            if (attendanceRows[0].locked)
                                continue; // Already locked
                            // 3. Calculate cutoff_time
                            const [startH, startM] = league.start_time.split(':').map(Number);
                            const weekDate = new Date(week.date + 'T00:00:00');
                            weekDate.setHours(startH, startM, 0, 0);
                            const cutoffTime = new Date(weekDate.getTime() - (league.attendance_cutoff_hours || 8) * 60 * 60 * 1000);
                            if (now < cutoffTime)
                                continue; // Not time yet
                            // 4. Lock attendance
                            yield attendanceService.lockAttendance(week.id);
                            logger_1.logger.info({ leagueId: league.id, leagueName: league.name, weekNumber: week.week_number }, 'Locked attendance');
                            // 5. Optionally adjust capacity hold
                            if (league.attendance_auto_adjust) {
                                const result = yield attendanceService.adjustCapacityHold(league.id, week.id);
                                if (result.adjusted) {
                                    logger_1.logger.info({ leagueId: league.id, leagueName: league.name, weekNumber: week.week_number, originalSpaces: result.originalSpaces, spacesNeeded: result.spacesNeeded }, 'Auto-adjusted capacity');
                                }
                                else {
                                    logger_1.logger.info({ leagueId: league.id, leagueName: league.name, weekNumber: week.week_number, spacesNeeded: result.spacesNeeded, originalSpaces: result.originalSpaces }, 'Capacity hold unchanged');
                                }
                            }
                            else {
                                // Log informational-only mode
                                const summary = yield attendanceService.getAttendanceSummary(week.id, league.players_per_space || 2);
                                logger_1.logger.info({ leagueId: league.id, leagueName: league.name, weekNumber: week.week_number, confirmed: summary.confirmed, totalPlayers: summary.totalPlayers, spacesNeeded: summary.spacesNeeded }, 'Attendance locked (informational)');
                            }
                            // 6. Team min attendance check (informational)
                            if (league.format === 'team' && league.team_min_attendance) {
                                const allAttendance = yield attendanceService.getAttendanceForWeek(week.id);
                                // Group by team
                                const teamMap = new Map();
                                for (const row of allAttendance) {
                                    const teamId = row.league_team_id;
                                    if (!teamId)
                                        continue;
                                    if (!teamMap.has(teamId))
                                        teamMap.set(teamId, { confirmed: 0, total: 0 });
                                    const team = teamMap.get(teamId);
                                    team.total++;
                                    if (row.status === 'confirmed')
                                        team.confirmed++;
                                }
                                for (const [teamId, counts] of teamMap) {
                                    if (counts.confirmed < league.team_min_attendance) {
                                        logger_1.logger.info({ teamId, confirmed: counts.confirmed, total: counts.total, minAttendance: league.team_min_attendance, weekNumber: week.week_number }, 'Team below minimum attendance');
                                    }
                                }
                            }
                        }
                        catch (weekErr) {
                            logger_1.logger.error({ err: weekErr, weekId: week.id }, 'Error processing attendance cutoff for week');
                        }
                    }
                }
                catch (leagueErr) {
                    logger_1.logger.error({ err: leagueErr, leagueId: league.id }, 'Error processing attendance cutoffs for league');
                }
            }
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Attendance cutoff job error');
        }
    });
}
