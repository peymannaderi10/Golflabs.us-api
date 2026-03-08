import { fromZonedTime } from 'date-fns-tz';
import { logger } from './logger';

// Helper function to parse time string (e.g., "2:30 PM") and return hours and minutes
export const parseTimeString = (timeStr: string): { hours: number; minutes: number } => {
  try {
    // If it's already an ISO string, extract the time part
    if (timeStr.includes('T')) {
      const timePart = timeStr.split('T')[1].split('.')[0]; // Get HH:MM:SS part
      const [hours, minutes] = timePart.split(':').map(Number);
      return { hours, minutes };
    }

    // Otherwise parse as 12-hour format
    const [time, period] = timeStr.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    const isPM = period === 'PM';
    const hour24 = isPM ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);
    return { hours: hour24, minutes };
  } catch (error) {
    logger.error({ err: error, timeStr }, 'Error parsing time string');
    throw new Error(`Invalid time format: ${timeStr}`);
  }
};

// Converts a date string + time string in a given IANA timezone to a UTC ISO string.
// Uses fromZonedTime which correctly handles DST boundaries.
export const createISOTimestamp = (date: string, timeStr: string, timezone: string = 'America/New_York'): string => {
  try {
    const { hours, minutes } = parseTimeString(timeStr);

    const wallClock = `${date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00.000`;

    const utcDate = fromZonedTime(wallClock, timezone);

    return utcDate.toISOString();
  } catch (error) {
    logger.error({ err: error, date, timeStr, timezone }, 'Error creating timestamp');
    throw error;
  }
}; 