"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
const expired_reservations_job_1 = require("./expired-reservations.job");
const notifications_job_1 = require("./notifications.job");
const reminder_job_1 = require("./reminder.job");
const handicap_job_1 = require("./handicap.job");
const league_deadline_job_1 = require("./league-deadline.job");
const league_mode_deactivate_job_1 = require("./league-mode-deactivate.job");
const attendance_reminder_job_1 = require("./attendance-reminder.job");
const attendance_cutoff_job_1 = require("./attendance-cutoff.job");
const marketing_scheduler_job_1 = require("./marketing-scheduler.job");
const intervals = [];
function startScheduler() {
    (0, reminder_job_1.enqueueReminders)();
    intervals.push(setInterval(expired_reservations_job_1.handleExpiredReservations, 2 * 60 * 1000), setInterval(notifications_job_1.dispatchNotifications, 60 * 1000), setInterval(reminder_job_1.enqueueReminders, 60 * 1000), setInterval(handicap_job_1.recalculateAllHandicaps, 24 * 60 * 60 * 1000), setInterval(league_deadline_job_1.processTeamDeadlines, 5 * 60 * 1000), setInterval(league_mode_deactivate_job_1.autoDeactivateLeagueMode, 5 * 60 * 1000), setInterval(attendance_reminder_job_1.sendAttendanceReminders, 5 * 60 * 1000), setInterval(attendance_cutoff_job_1.processAttendanceCutoffs, 5 * 60 * 1000), setInterval(marketing_scheduler_job_1.processScheduledCampaigns, 60 * 1000));
    console.log('Background job scheduler started');
}
function stopScheduler() {
    intervals.forEach(clearInterval);
    intervals.length = 0;
    console.log('Background job scheduler stopped');
}
