"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const expired_reservations_job_1 = require("./expired-reservations.job");
const notifications_job_1 = require("./notifications.job");
const reminder_job_1 = require("./reminder.job");
function startScheduler() {
    // Run the expiration check every 2 minutes
    setInterval(expired_reservations_job_1.handleExpiredReservations, 2 * 60 * 1000);
    // Run the notification dispatch every minute
    setInterval(notifications_job_1.dispatchNotifications, 60 * 1000);
    // Run the reminder check every 5 minutes
    setInterval(reminder_job_1.enqueueReminders, 5 * 60 * 1000);
    console.log('Background job scheduler started (expiration: 2min, notifications: 1min, reminders: 5min)');
}
