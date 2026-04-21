import { handleExpiredReservations } from './expired-reservations.job';
import { dispatchNotifications } from './notifications.job';
import { enqueueReminders } from './reminder.job';
import { recalculateAllHandicaps } from './handicap.job';
import { processTeamDeadlines } from './league-deadline.job';
import { autoDeactivateLeagueMode } from './league-mode-deactivate.job';
import { sendAttendanceReminders } from './attendance-reminder.job';
import { processAttendanceCutoffs } from './attendance-cutoff.job';
import { processScheduledCampaigns } from './marketing-scheduler.job';
import { enforceDataRetention } from './data-retention.job';
import { enqueuePostBookingReviews } from './post-booking-review.job';
import { markAbandonedGuestAttempts } from './abandoned-guest-attempts.job';
import { logger } from '../shared/utils/logger';

const intervals: NodeJS.Timeout[] = [];

export function startScheduler() {
  // Run immediately on startup to catch anything missed while offline
  enqueueReminders();
  processAttendanceCutoffs();

  intervals.push(
    setInterval(handleExpiredReservations, 2 * 60 * 1000),
    setInterval(dispatchNotifications, 60 * 1000),
    setInterval(enqueueReminders, 60 * 1000),
    setInterval(recalculateAllHandicaps, 24 * 60 * 60 * 1000),
    setInterval(processTeamDeadlines, 5 * 60 * 1000),
    setInterval(autoDeactivateLeagueMode, 5 * 60 * 1000),
    setInterval(sendAttendanceReminders, 5 * 60 * 1000),
    setInterval(processAttendanceCutoffs, 5 * 60 * 1000),
    setInterval(processScheduledCampaigns, 60 * 1000),
    setInterval(enforceDataRetention, 24 * 60 * 60 * 1000),
    setInterval(enqueuePostBookingReviews, 5 * 60 * 1000),
    setInterval(markAbandonedGuestAttempts, 60 * 60 * 1000), // hourly
  );

  logger.info('Background job scheduler started');
}

export function stopScheduler() {
  intervals.forEach(clearInterval);
  intervals.length = 0;
  logger.info('Background job scheduler stopped');
} 