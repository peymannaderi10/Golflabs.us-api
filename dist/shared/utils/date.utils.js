"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createISOTimestamp = exports.parseTimeString = void 0;
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
// Helper function to create ISO timestamp from date and time string
const createISOTimestamp = (date, timeStr, timezone = 'America/New_York') => {
    try {
        const { hours, minutes } = (0, exports.parseTimeString)(timeStr);
        // Create a date-time string in ISO format but without timezone
        const isoString = `${date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00.000`;
        // Create a date object from this string (will be in local server time)
        const localDate = new Date(isoString);
        // Convert to the target timezone using toLocaleString, then back to a Date object
        const timeInTargetTZ = localDate.toLocaleString('sv-SE', { timeZone: timezone });
        const targetDate = new Date(timeInTargetTZ);
        // Calculate the offset between what we want and what we got
        const offset = localDate.getTime() - targetDate.getTime();
        // Apply the offset to get the correct UTC time
        const utcDate = new Date(localDate.getTime() + offset);
        return utcDate.toISOString();
    }
    catch (error) {
        console.error('Error creating timestamp:', { date, timeStr, timezone }, error);
        throw error;
    }
};
exports.createISOTimestamp = createISOTimestamp;
