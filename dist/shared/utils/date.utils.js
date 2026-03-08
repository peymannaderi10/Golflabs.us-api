"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createISOTimestamp = exports.parseTimeString = void 0;
const date_fns_tz_1 = require("date-fns-tz");
// Helper function to parse time string (e.g., "2:30 PM") and return hours and minutes
const parseTimeString = (timeStr) => {
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
    }
    catch (error) {
        console.error('Error parsing time string:', timeStr, error);
        throw new Error(`Invalid time format: ${timeStr}`);
    }
};
exports.parseTimeString = parseTimeString;
// Converts a date string + time string in a given IANA timezone to a UTC ISO string.
// Uses fromZonedTime which correctly handles DST boundaries.
const createISOTimestamp = (date, timeStr, timezone = 'America/New_York') => {
    try {
        const { hours, minutes } = (0, exports.parseTimeString)(timeStr);
        const wallClock = `${date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00.000`;
        const utcDate = (0, date_fns_tz_1.fromZonedTime)(wallClock, timezone);
        return utcDate.toISOString();
    }
    catch (error) {
        console.error('Error creating timestamp:', { date, timeStr, timezone }, error);
        throw error;
    }
};
exports.createISOTimestamp = createISOTimestamp;
