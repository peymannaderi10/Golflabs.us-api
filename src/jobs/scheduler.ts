import { handleExpiredReservations } from './expired-reservations.job';
import { dispatchNotifications } from './notifications.job';
import { enqueueReminders } from './reminder.job';
import { recalculateAllHandicaps } from './handicap.job';
import { processTeamDeadlines } from './league-deadline.job';
import { autoDeactivateLeagueMode } from './league-mode-deactivate.job';
import { sendAttendanceReminders } from './attendance-reminder.job';
import { processAttendanceCutoffs } from './attendance-cutoff.job';

export function startScheduler() {
  // Run the expiration check every 2 minutes
  setInterval(handleExpiredReservations, 2 * 60 * 1000);
  
  // Run the notification dispatch every minute
  setInterval(dispatchNotifications, 60 * 1000);
  
  // Run the reminder check every 5 minutes
  setInterval(enqueueReminders, 5 * 60 * 1000);

  // Run handicap recalculation daily at 3 AM as a safety net
  // (Primary trigger is on-demand via LeagueService.finalizeWeek)
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(recalculateAllHandicaps, TWENTY_FOUR_HOURS);

  // Run team league deadline check every 5 minutes
  // Disqualifies teams with unpaid members after the league start time
  setInterval(processTeamDeadlines, 5 * 60 * 1000);

  // Auto-deactivate league mode on bays after league end time + buffer
  // Checks every 5 minutes
  setInterval(autoDeactivateLeagueMode, 5 * 60 * 1000);

  // Send attendance reminders for leagues with attendance_required = true
  // Checks every 5 minutes
  setInterval(sendAttendanceReminders, 5 * 60 * 1000);

  // Lock attendance and optionally adjust capacity holds at cutoff time
  // Checks every 5 minutes
  setInterval(processAttendanceCutoffs, 5 * 60 * 1000);
  
  console.log('Background job scheduler started (expiration: 2min, notifications: 1min, reminders: 5min, handicaps: 24h, team-deadlines: 5min, league-mode-deactivate: 5min, attendance-reminders: 5min, attendance-cutoffs: 5min)');
} 