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
exports.sendAttendanceReminders = sendAttendanceReminders;
const database_1 = require("../config/database");
const resend_1 = require("../config/resend");
const attendance_service_1 = require("../modules/leagues/attendance.service");
const email_service_1 = require("../modules/email/email.service");
const attendanceService = new attendance_service_1.AttendanceService();
/**
 * Attendance Reminder Job
 *
 * Runs every 5 minutes. For each league with attendance_required = true:
 * 1. Finds the next upcoming/active week
 * 2. If now >= reminder_time and rows don't exist yet, generates rows + sends emails
 *
 * reminder_time = week.date + league.start_time - attendance_reminder_hours
 */
function sendAttendanceReminders() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. Get all active leagues with attendance enabled
            const { data: leagues, error } = yield database_1.supabase
                .from('leagues')
                .select('id, name, start_time, attendance_reminder_hours, attendance_cutoff_hours')
                .eq('attendance_required', true)
                .in('status', ['active', 'registration']);
            if (error || !leagues || leagues.length === 0)
                return;
            const now = new Date();
            const frontendUrl = resend_1.resendConfig.frontendUrl;
            for (const league of leagues) {
                try {
                    // 2. Find the next upcoming or active week for this league
                    const { data: weeks } = yield database_1.supabase
                        .from('league_weeks')
                        .select('id, week_number, date, status')
                        .eq('league_id', league.id)
                        .in('status', ['upcoming', 'active'])
                        .order('date', { ascending: true })
                        .limit(1);
                    if (!weeks || weeks.length === 0)
                        continue;
                    const week = weeks[0];
                    // 3. Calculate reminder_time
                    const [startH, startM] = league.start_time.split(':').map(Number);
                    const weekDate = new Date(week.date + 'T00:00:00');
                    weekDate.setHours(startH, startM, 0, 0);
                    const reminderTime = new Date(weekDate.getTime() - (league.attendance_reminder_hours || 24) * 60 * 60 * 1000);
                    // Not time to send reminders yet
                    if (now < reminderTime)
                        continue;
                    // 4. Check if reminders were already sent for this week
                    const { data: existingRows } = yield database_1.supabase
                        .from('league_attendance')
                        .select('id, reminder_sent_at')
                        .eq('league_week_id', week.id)
                        .limit(1);
                    if (existingRows && existingRows.length > 0 && existingRows[0].reminder_sent_at) {
                        // Reminders already sent
                        continue;
                    }
                    // 5. Check if the hold for this week is suspended (e.g., holiday skip)
                    const { data: hold } = yield database_1.supabase
                        .from('capacity_holds')
                        .select('id, status')
                        .eq('league_week_id', week.id)
                        .limit(1);
                    if (hold && hold.length > 0 && hold[0].status === 'suspended') {
                        // Skip this week — it's been suspended (holiday etc.)
                        continue;
                    }
                    // 6. Generate attendance rows
                    const rows = yield attendanceService.generateAttendanceRows(league.id, week.id);
                    if (rows.length === 0)
                        continue;
                    // 7. Format the date/time for the email
                    const dateObj = new Date(week.date + 'T00:00:00');
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const leagueDate = `${dayNames[dateObj.getDay()]}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
                    // Format start time from 24h to 12h
                    const hour = startH > 12 ? startH - 12 : startH === 0 ? 12 : startH;
                    const ampm = startH >= 12 ? 'PM' : 'AM';
                    const startTimeFormatted = `${hour}:${String(startM).padStart(2, '0')} ${ampm}`;
                    // 8. For each row, get player info and send reminder
                    for (const row of rows) {
                        try {
                            // Get user info for the email
                            const { data: user } = yield database_1.supabase
                                .from('users')
                                .select('full_name, email')
                                .eq('id', row.user_id)
                                .single();
                            if (!user || !user.email)
                                continue;
                            const playerName = user.full_name || 'Golfer';
                            yield email_service_1.EmailService.sendAttendanceReminderEmail({
                                playerName,
                                playerEmail: user.email,
                                leagueName: league.name,
                                weekNumber: week.week_number,
                                leagueDate,
                                startTime: startTimeFormatted,
                                confirmUrl: `${frontendUrl}/attendance/confirm/${row.confirmation_token}`,
                                declineUrl: `${frontendUrl}/attendance/decline/${row.confirmation_token}`,
                            });
                            // Mark reminder as sent
                            yield database_1.supabase
                                .from('league_attendance')
                                .update({ reminder_sent_at: new Date().toISOString() })
                                .eq('id', row.id);
                        }
                        catch (emailErr) {
                            console.error(`Failed to send attendance reminder for row ${row.id}:`, emailErr);
                        }
                    }
                    console.log(`Sent ${rows.length} attendance reminders for league "${league.name}" Week ${week.week_number}`);
                }
                catch (leagueErr) {
                    console.error(`Error processing attendance reminders for league ${league.id}:`, leagueErr);
                }
            }
        }
        catch (err) {
            console.error('Attendance reminder job error:', err);
        }
    });
}
