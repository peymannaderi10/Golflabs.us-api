import { supabase } from '../config/database';
import { logger } from '../shared/utils/logger';

/**
 * Enforces data retention policies:
 * - Access logs: delete entries older than 90 days
 * - Notifications: delete entries older than 90 days
 * - Bookings: anonymize user_id on records older than 7 years
 *
 * Runs once daily.
 */
export async function enforceDataRetention() {
  const now = new Date();

  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const sevenYearsAgo = new Date(now);
  sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

  try {
    const { count: logsDeleted } = await supabase
      .from('access_logs')
      .delete({ count: 'exact' })
      .lt('created_at', ninetyDaysAgo.toISOString());

    const { count: notificationsDeleted } = await supabase
      .from('notifications')
      .delete({ count: 'exact' })
      .lt('created_at', ninetyDaysAgo.toISOString());

    const { count: bookingsAnonymized } = await supabase
      .from('bookings')
      .update({ user_id: null, notes: null })
      .not('user_id', 'is', null)
      .lt('created_at', sevenYearsAgo.toISOString());

    logger.info(
      { logsDeleted, notificationsDeleted, bookingsAnonymized },
      'Data retention job completed'
    );
  } catch (error) {
    logger.error({ err: error }, 'Data retention job failed');
  }
}
