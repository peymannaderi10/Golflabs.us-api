"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const expired_reservations_job_1 = require("./expired-reservations.job");
function startScheduler() {
    // Run the expiration check every minute
    setInterval(expired_reservations_job_1.handleExpiredReservations, 60 * 1000);
    console.log('Background job scheduler started');
}
