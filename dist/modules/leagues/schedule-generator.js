"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewSchedule = void 0;
exports.generateSessionDates = generateSessionDates;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_SESSIONS = 200;
/**
 * Generates session dates from a ScheduleConfig.
 * Pure function — no side effects or DB access.
 */
function generateSessionDates(config) {
    validateConfig(config);
    let sessions;
    switch (config.pattern) {
        case 'weekly':
            sessions = generateWeekly(config, 7);
            break;
        case 'biweekly':
            sessions = generateWeekly(config, 14);
            break;
        case 'multi_day_weekly':
            sessions = generateMultiDayWeekly(config);
            break;
        case 'daily_block':
            sessions = generateDailyBlock(config);
            break;
        case 'custom':
            sessions = generateCustom(config);
            break;
        default:
            throw new Error(`Unknown schedule pattern: ${config.pattern}`);
    }
    if (sessions.length > MAX_SESSIONS) {
        throw new Error(`Schedule generates ${sessions.length} sessions, exceeding the maximum of ${MAX_SESSIONS}`);
    }
    return sessions;
}
/** Alias for the preview endpoint */
exports.previewSchedule = generateSessionDates;
function validateConfig(config) {
    if (!config.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(config.startDate)) {
        throw new Error('startDate must be in YYYY-MM-DD format');
    }
    if (!config.daysOfWeek || config.daysOfWeek.length === 0) {
        throw new Error('daysOfWeek must have at least 1 entry');
    }
    for (const d of config.daysOfWeek) {
        if (d < 0 || d > 6)
            throw new Error(`Invalid day of week: ${d}`);
    }
    if (!config.startTime || !config.endTime) {
        throw new Error('startTime and endTime are required');
    }
}
/**
 * Weekly / Biweekly: find first matching day on/after startDate,
 * then advance by stepDays for totalCalendarWeeks iterations.
 */
function generateWeekly(config, stepDays) {
    var _a;
    const totalWeeks = (_a = config.totalCalendarWeeks) !== null && _a !== void 0 ? _a : 10;
    if (totalWeeks <= 0)
        return [];
    const dayOfWeek = config.daysOfWeek[0];
    const start = parseDate(config.startDate);
    // Find first occurrence of dayOfWeek on or after start
    const startDow = start.getUTCDay();
    const daysUntil = (dayOfWeek - startDow + 7) % 7;
    const firstDate = new Date(start);
    firstDate.setUTCDate(firstDate.getUTCDate() + daysUntil);
    const sessions = [];
    for (let i = 0; i < totalWeeks; i++) {
        const date = new Date(firstDate);
        date.setUTCDate(date.getUTCDate() + i * stepDays);
        sessions.push({
            date: formatDate(date),
            sessionNumber: i + 1,
            sessionLabel: `Week ${i + 1}`,
        });
    }
    return sessions;
}
/**
 * Multi-day weekly: for each calendar week, generate one date per daysOfWeek entry.
 * Label: "Week N (Tue)", "Week N (Thu)"
 */
function generateMultiDayWeekly(config) {
    var _a;
    const totalWeeks = (_a = config.totalCalendarWeeks) !== null && _a !== void 0 ? _a : 10;
    if (totalWeeks <= 0)
        return [];
    const sortedDays = [...config.daysOfWeek].sort((a, b) => a - b);
    const start = parseDate(config.startDate);
    // Find the start of the week containing startDate (aligned to first day in sortedDays)
    const startDow = start.getUTCDay();
    const firstDay = sortedDays[0];
    const daysUntilFirst = (firstDay - startDow + 7) % 7;
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() + daysUntilFirst);
    const sessions = [];
    let sessionNum = 0;
    for (let week = 0; week < totalWeeks; week++) {
        for (const dow of sortedDays) {
            // Calculate offset from the first day of this calendar week
            const dayOffset = (dow - firstDay + 7) % 7;
            const date = new Date(weekStart);
            date.setUTCDate(date.getUTCDate() + week * 7 + dayOffset);
            sessionNum++;
            sessions.push({
                date: formatDate(date),
                sessionNumber: sessionNum,
                sessionLabel: `Week ${week + 1} (${DAY_NAMES[dow]})`,
            });
        }
    }
    return sessions;
}
/**
 * Daily block: every day from startDate to blockEndDate,
 * filtered to daysOfWeek if specified.
 */
function generateDailyBlock(config) {
    if (!config.blockEndDate) {
        throw new Error('blockEndDate is required for daily_block pattern');
    }
    const start = parseDate(config.startDate);
    const end = parseDate(config.blockEndDate);
    if (end < start) {
        throw new Error('blockEndDate must be on or after startDate');
    }
    const allowedDays = new Set(config.daysOfWeek);
    const sessions = [];
    let sessionNum = 0;
    const current = new Date(start);
    while (current <= end) {
        if (allowedDays.has(current.getUTCDay())) {
            sessionNum++;
            sessions.push({
                date: formatDate(current),
                sessionNumber: sessionNum,
                sessionLabel: `Day ${sessionNum}`,
            });
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return sessions;
}
/**
 * Custom: map customDates directly, sorted chronologically.
 */
function generateCustom(config) {
    if (!config.customDates || config.customDates.length === 0) {
        throw new Error('customDates is required for custom pattern');
    }
    for (const d of config.customDates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            throw new Error(`Invalid customDate format: ${d}`);
        }
        const parsed = parseDate(d);
        if (isNaN(parsed.getTime())) {
            throw new Error(`customDate '${d}' is not a valid calendar date`);
        }
    }
    const sorted = [...config.customDates].sort();
    return sorted.map((dateStr, i) => ({
        date: dateStr,
        sessionNumber: i + 1,
        sessionLabel: `Session ${i + 1}`,
    }));
}
function parseDate(dateStr) {
    // Parse as UTC to avoid timezone issues
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}
function formatDate(date) {
    return date.toISOString().split('T')[0];
}
