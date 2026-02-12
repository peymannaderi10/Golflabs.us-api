"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const expired_reservations_job_1 = require("./expired-reservations.job");
const notifications_job_1 = require("./notifications.job");
const reminder_job_1 = require("./reminder.job");
const handicap_job_1 = require("./handicap.job");
const league_deadline_job_1 = require("./league-deadline.job");
function startScheduler() {
    // Run the expiration check every 2 minutes
    setInterval(expired_reservations_job_1.handleExpiredReservations, 2 * 60 * 1000);
    // Run the notification dispatch every minute
    setInterval(notifications_job_1.dispatchNotifications, 60 * 1000);
    // Run the reminder check every 5 minutes
    setInterval(reminder_job_1.enqueueReminders, 5 * 60 * 1000);
    // Run handicap recalculation daily at 3 AM as a safety net
    // (Primary trigger is on-demand via LeagueService.finalizeWeek)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setInterval(handicap_job_1.recalculateAllHandicaps, TWENTY_FOUR_HOURS);
    // Run team league deadline check every 5 minutes
    // Disqualifies teams with unpaid members after the league start time
    setInterval(league_deadline_job_1.processTeamDeadlines, 5 * 60 * 1000);
    console.log('Background job scheduler started (expiration: 2min, notifications: 1min, reminders: 5min, handicaps: 24h, team-deadlines: 5min)');
}
