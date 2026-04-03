"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeService = exports.EmployeeService = void 0;
const database_1 = require("../../config/database");
const date_utils_1 = require("../../shared/utils/date.utils");
const logger_1 = require("../../shared/utils/logger");
class EmployeeService {
    /**
     * Get revenue statistics for a location within a date range
     */
    getRevenueStats(locationId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get location timezone
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
            const startUTC = (0, date_utils_1.createISOTimestamp)(startDate, '12:00 AM', timezone);
            const endUTC = (0, date_utils_1.createISOTimestamp)(endDate, '11:59 PM', timezone);
            // Get all successful payments within the date range for this location
            const { data: payments, error } = yield database_1.supabase
                .from('payments')
                .select('amount, processed_at, booking_id')
                .eq('location_id', locationId)
                .eq('status', 'succeeded')
                .gte('processed_at', startUTC)
                .lte('processed_at', endUTC)
                .order('processed_at', { ascending: true });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching revenue stats');
                throw error;
            }
            // Aggregate daily revenue
            const dailyRevenueMap = new Map();
            let totalRevenue = 0;
            (payments || []).forEach((payment) => {
                if (payment.processed_at) {
                    const dateKey = new Date(payment.processed_at).toISOString().split('T')[0];
                    const existing = dailyRevenueMap.get(dateKey) || { revenue: 0, bookingCount: 0 };
                    existing.revenue += payment.amount || 0;
                    existing.bookingCount += 1;
                    dailyRevenueMap.set(dateKey, existing);
                    totalRevenue += payment.amount || 0;
                }
            });
            const dailyRevenue = Array.from(dailyRevenueMap.entries())
                .map(([date, data]) => ({
                date,
                revenue: data.revenue,
                bookingCount: data.bookingCount,
            }))
                .sort((a, b) => a.date.localeCompare(b.date));
            const totalBookings = (payments === null || payments === void 0 ? void 0 : payments.length) || 0;
            const averageOrderValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
            return {
                totalRevenue,
                averageOrderValue,
                totalBookings,
                dailyRevenue,
            };
        });
    }
    /**
     * Get booking statistics for a location within a date range
     */
    getBookingStats(locationId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get location timezone
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
            const startUTC = (0, date_utils_1.createISOTimestamp)(startDate, '12:00 AM', timezone);
            const endUTC = (0, date_utils_1.createISOTimestamp)(endDate, '11:59 PM', timezone);
            // Get all bookings (excluding abandoned) within the date range
            const { data: bookings, error } = yield database_1.supabase
                .from('bookings')
                .select('id, start_time, end_time, status, party_size')
                .eq('location_id', locationId)
                .gte('start_time', startUTC)
                .lte('start_time', endUTC)
                .neq('status', 'abandoned')
                .neq('status', 'expired');
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching booking stats');
                throw error;
            }
            const allBookings = bookings || [];
            const confirmedBookings = allBookings.filter(b => b.status === 'confirmed').length;
            const cancelledBookings = allBookings.filter(b => b.status === 'cancelled').length;
            const pendingBookings = allBookings.filter(b => b.status === 'pending' || b.status === 'reserved').length;
            const totalBookings = allBookings.length;
            const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;
            // Calculate average party size (only from confirmed bookings)
            const confirmedWithPartySize = allBookings.filter(b => b.status === 'confirmed' && b.party_size);
            const averagePartySize = confirmedWithPartySize.length > 0
                ? confirmedWithPartySize.reduce((sum, b) => sum + (b.party_size || 1), 0) / confirmedWithPartySize.length
                : 1;
            // Calculate average booking duration (in minutes)
            const confirmedBookingsData = allBookings.filter(b => b.status === 'confirmed');
            let averageBookingDuration = 60; // default 1 hour
            if (confirmedBookingsData.length > 0) {
                const totalDuration = confirmedBookingsData.reduce((sum, b) => {
                    const start = new Date(b.start_time).getTime();
                    const end = new Date(b.end_time).getTime();
                    return sum + (end - start) / (1000 * 60); // in minutes
                }, 0);
                averageBookingDuration = totalDuration / confirmedBookingsData.length;
            }
            // Calculate hourly distribution (for heatmap)
            const hourlyDistribution = [];
            const hourlyMap = new Map();
            confirmedBookingsData.forEach((booking) => {
                const startTime = new Date(booking.start_time);
                // Convert to local time for the hour
                const localDate = new Date(startTime.toLocaleString('en-US', { timeZone: timezone }));
                const hour = localDate.getHours();
                const dayOfWeek = localDate.getDay();
                const key = `${dayOfWeek}-${hour}`;
                hourlyMap.set(key, (hourlyMap.get(key) || 0) + 1);
            });
            // Generate full grid for heatmap (all hours, all days)
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                for (let hour = 0; hour < 24; hour++) {
                    const key = `${dayOfWeek}-${hour}`;
                    hourlyDistribution.push({
                        hour,
                        dayOfWeek,
                        count: hourlyMap.get(key) || 0,
                    });
                }
            }
            return {
                totalBookings,
                confirmedBookings,
                cancelledBookings,
                pendingBookings,
                cancellationRate,
                averagePartySize,
                averageBookingDuration,
                hourlyDistribution,
            };
        });
    }
    /**
     * Get bay performance statistics for a location within a date range
     */
    getBayStats(locationId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get location timezone
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
            const startUTC = (0, date_utils_1.createISOTimestamp)(startDate, '12:00 AM', timezone);
            const endUTC = (0, date_utils_1.createISOTimestamp)(endDate, '11:59 PM', timezone);
            // Get all bays for this location
            const { data: bays, error: baysError } = yield database_1.supabase
                .from('bays')
                .select('id, bay_number, name')
                .eq('location_id', locationId)
                .is('deleted_at', null)
                .order('bay_number');
            if (baysError) {
                logger_1.logger.error({ err: baysError }, 'Error fetching bays');
                throw baysError;
            }
            // Get confirmed bookings for each bay
            const { data: bookings, error: bookingsError } = yield database_1.supabase
                .from('bookings')
                .select('bay_id, start_time, end_time, total_amount')
                .eq('location_id', locationId)
                .eq('status', 'confirmed')
                .gte('start_time', startUTC)
                .lte('start_time', endUTC);
            if (bookingsError) {
                logger_1.logger.error({ err: bookingsError }, 'Error fetching bay bookings');
                throw bookingsError;
            }
            // Calculate operating hours for utilization calculation
            const startDateObj = new Date(startDate);
            const endDateObj = new Date(endDate);
            const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            // Assume 14 hours of operation per day (e.g., 9am-11pm)
            const totalAvailableHoursPerBay = daysDiff * 14;
            // Aggregate by bay
            const bayPerformanceMap = new Map();
            (bookings || []).forEach((booking) => {
                const bayId = booking.bay_id;
                if (!bayId)
                    return;
                const start = new Date(booking.start_time).getTime();
                const end = new Date(booking.end_time).getTime();
                const hoursBooked = (end - start) / (1000 * 60 * 60);
                const existing = bayPerformanceMap.get(bayId) || { hoursBooked: 0, bookings: 0, revenue: 0 };
                existing.hoursBooked += hoursBooked;
                existing.bookings += 1;
                existing.revenue += booking.total_amount || 0;
                bayPerformanceMap.set(bayId, existing);
            });
            // Build bay performance array
            const bayPerformance = (bays || []).map((bay) => {
                const stats = bayPerformanceMap.get(bay.id) || { hoursBooked: 0, bookings: 0, revenue: 0 };
                const utilizationRate = totalAvailableHoursPerBay > 0
                    ? (stats.hoursBooked / totalAvailableHoursPerBay) * 100
                    : 0;
                return {
                    bayId: bay.id,
                    bayNumber: bay.bay_number,
                    bayName: bay.name,
                    totalHoursBooked: Math.round(stats.hoursBooked * 10) / 10,
                    totalBookings: stats.bookings,
                    utilizationRate: Math.round(utilizationRate * 10) / 10,
                    revenue: stats.revenue,
                };
            });
            // Sort by bookings for top performing
            const sortedByBookings = [...bayPerformance].sort((a, b) => b.totalBookings - a.totalBookings);
            const topPerformingBay = sortedByBookings[0] || null;
            // Calculate average utilization
            const averageUtilization = bayPerformance.length > 0
                ? bayPerformance.reduce((sum, b) => sum + b.utilizationRate, 0) / bayPerformance.length
                : 0;
            return {
                bays: bayPerformance,
                totalBays: (bays === null || bays === void 0 ? void 0 : bays.length) || 0,
                averageUtilization: Math.round(averageUtilization * 10) / 10,
                topPerformingBay,
            };
        });
    }
    /**
     * Get access log statistics for a location within a date range
     */
    getAccessLogStats(locationId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get location timezone
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
            const startUTC = (0, date_utils_1.createISOTimestamp)(startDate, '12:00 AM', timezone);
            const endUTC = (0, date_utils_1.createISOTimestamp)(endDate, '11:59 PM', timezone);
            // Get access logs for this location
            const { data: logs, error } = yield database_1.supabase
                .from('access_logs')
                .select('action, success, error_message, response_time_ms, unlock_method')
                .eq('location_id', locationId)
                .gte('timestamp', startUTC)
                .lte('timestamp', endUTC);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching access logs');
                throw error;
            }
            const allLogs = logs || [];
            const unlockLogs = allLogs.filter(l => l.action === 'unlock' || l.action === 'door_unlock');
            const successfulUnlocks = unlockLogs.filter(l => l.success).length;
            const failedUnlocks = unlockLogs.filter(l => !l.success).length;
            const totalUnlockAttempts = unlockLogs.length;
            const successRate = totalUnlockAttempts > 0 ? (successfulUnlocks / totalUnlockAttempts) * 100 : 100;
            // Calculate average response time
            const responseTimes = unlockLogs.filter(l => l.response_time_ms).map(l => l.response_time_ms);
            const averageResponseTime = responseTimes.length > 0
                ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
                : 0;
            // Aggregate unlock methods
            const methodMap = new Map();
            unlockLogs.forEach((log) => {
                const method = log.unlock_method || 'unknown';
                methodMap.set(method, (methodMap.get(method) || 0) + 1);
            });
            const unlockMethodBreakdown = Array.from(methodMap.entries())
                .map(([method, count]) => ({ method, count }))
                .sort((a, b) => b.count - a.count);
            // Aggregate common errors
            const errorMap = new Map();
            unlockLogs.filter(l => !l.success && l.error_message).forEach((log) => {
                const error = log.error_message || 'Unknown error';
                errorMap.set(error, (errorMap.get(error) || 0) + 1);
            });
            const commonErrors = Array.from(errorMap.entries())
                .map(([errorMessage, count]) => ({ errorMessage, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5); // Top 5 errors
            return {
                totalUnlockAttempts,
                successfulUnlocks,
                failedUnlocks,
                successRate: Math.round(successRate * 10) / 10,
                averageResponseTime: Math.round(averageResponseTime),
                unlockMethodBreakdown,
                commonErrors,
            };
        });
    }
    /**
     * Get combined overview for dashboard
     */
    getOverview(locationId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            const [revenueStats, bookingStats, bayStats, accessLogStats] = yield Promise.all([
                this.getRevenueStats(locationId, startDate, endDate),
                this.getBookingStats(locationId, startDate, endDate),
                this.getBayStats(locationId, startDate, endDate),
                this.getAccessLogStats(locationId, startDate, endDate),
            ]);
            // Find peak hour and busiest day from booking stats
            const hourCounts = new Map();
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayCounts = new Map();
            bookingStats.hourlyDistribution.forEach((item) => {
                hourCounts.set(item.hour, (hourCounts.get(item.hour) || 0) + item.count);
                dayCounts.set(item.dayOfWeek, (dayCounts.get(item.dayOfWeek) || 0) + item.count);
            });
            let peakHour = 12; // default noon
            let maxHourCount = 0;
            hourCounts.forEach((count, hour) => {
                if (count > maxHourCount) {
                    maxHourCount = count;
                    peakHour = hour;
                }
            });
            let busiestDayIndex = 6; // default Saturday
            let maxDayCount = 0;
            dayCounts.forEach((count, day) => {
                if (count > maxDayCount) {
                    maxDayCount = count;
                    busiestDayIndex = day;
                }
            });
            return {
                revenue: {
                    total: revenueStats.totalRevenue,
                    averageOrderValue: Math.round(revenueStats.averageOrderValue * 100) / 100,
                    trend: 0, // Could compare with previous period if needed
                },
                bookings: {
                    total: bookingStats.totalBookings,
                    confirmed: bookingStats.confirmedBookings,
                    cancelled: bookingStats.cancelledBookings,
                    cancellationRate: Math.round(bookingStats.cancellationRate * 10) / 10,
                },
                utilization: {
                    averageRate: bayStats.averageUtilization,
                    peakHour,
                    busiestDay: dayNames[busiestDayIndex],
                },
                accessLogs: {
                    successRate: accessLogStats.successRate,
                    totalAttempts: accessLogStats.totalUnlockAttempts,
                },
            };
        });
    }
    /**
     * Export report data as CSV
     */
    escapeCSV(value) {
        const str = String(value !== null && value !== void 0 ? value : '');
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        // Prevent CSV injection: escape leading =, +, -, @, tab, CR
        if (/^[=+\-@\t\r]/.test(str)) {
            return `"'${str}"`;
        }
        return str;
    }
    exportCSV(locationId, startDate, endDate, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const esc = this.escapeCSV.bind(this);
            if (type === 'revenue') {
                const stats = yield this.getRevenueStats(locationId, startDate, endDate);
                const header = 'Date,Revenue,Bookings\n';
                const rows = stats.dailyRevenue.map(d => `${esc(d.date)},${esc(d.revenue)},${esc(d.bookingCount)}`).join('\n');
                return header + rows;
            }
            else if (type === 'bays') {
                const stats = yield this.getBayStats(locationId, startDate, endDate);
                const header = 'Bay Number,Bay Name,Hours Booked,Bookings,Revenue,Utilization %\n';
                const rows = stats.bays.map(b => `${esc(b.bayNumber)},${esc(b.bayName)},${esc(b.totalHoursBooked)},${esc(b.totalBookings)},${esc(b.revenue)},${esc(b.utilizationRate)}`).join('\n');
                return header + rows;
            }
            return '';
        });
    }
    /**
     * Get customers list with pagination and search
     */
    getCustomers(locationId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page = 1, pageSize = 10, search, sortBy = 'createdAt', sortOrder = 'desc', membershipFilter = 'all', userType, minBookings, minSpend } = params;
            // If filtering by membership, get member user IDs first
            let memberUserIds = null;
            if (membershipFilter === 'members' || membershipFilter === 'non-members') {
                const { data: memberRows } = yield database_1.supabase
                    .from('memberships')
                    .select('user_id')
                    .eq('location_id', locationId)
                    .in('status', ['active', 'trialing', 'past_due']);
                memberUserIds = (memberRows || []).map(r => r.user_id);
            }
            let query = database_1.supabase.from('user_profiles').select('*', { count: 'exact' })
                .eq('location_id', locationId)
                .is('deleted_at', null);
            if (search) {
                query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
            }
            if (membershipFilter === 'members' && memberUserIds) {
                if (memberUserIds.length === 0) {
                    return { customers: [], total: 0 };
                }
                query = query.in('id', memberUserIds);
            }
            else if (membershipFilter === 'non-members' && memberUserIds) {
                if (memberUserIds.length > 0) {
                    query = query.not('id', 'in', `(${memberUserIds.join(',')})`);
                }
            }
            if (userType) {
                query = query.eq('user_type', userType);
            }
            // Pagination
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);
            // Sorting — computed fields (totalSpend, etc.) are post-query, so DB sort is limited
            const sortMap = {
                createdAt: 'created_at',
                email: 'email',
                fullName: 'full_name',
            };
            const sortColumn = sortMap[sortBy] || 'created_at';
            query = query.order(sortColumn, { ascending: sortOrder === 'asc' });
            const { data: profiles, count, error } = yield query;
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching customers');
                throw error;
            }
            // Batch fetch booking stats for all profiles in one query (avoids N+1)
            const profileIds = (profiles || []).map(p => p.id);
            const { data: allBookings } = profileIds.length > 0
                ? yield database_1.supabase
                    .from('bookings')
                    .select('user_id, total_amount, start_time')
                    .in('user_id', profileIds)
                    .eq('location_id', locationId)
                    .eq('status', 'confirmed')
                : { data: [] };
            // Group by user_id
            const bookingsByUser = new Map();
            for (const b of allBookings || []) {
                const existing = bookingsByUser.get(b.user_id) || { totalBookings: 0, totalSpend: 0, lastVisit: null };
                existing.totalBookings++;
                existing.totalSpend += b.total_amount || 0;
                if (!existing.lastVisit || b.start_time > existing.lastVisit) {
                    existing.lastVisit = b.start_time;
                }
                bookingsByUser.set(b.user_id, existing);
            }
            const customers = (profiles || []).map((profile) => {
                const stats = bookingsByUser.get(profile.id) || { totalBookings: 0, totalSpend: 0, lastVisit: null };
                return {
                    id: profile.id,
                    email: profile.email,
                    fullName: profile.full_name,
                    phone: profile.phone,
                    userType: profile.user_type || 'regular',
                    createdAt: profile.created_at,
                    totalBookings: stats.totalBookings,
                    totalSpend: stats.totalSpend,
                    lastVisit: stats.lastVisit,
                };
            });
            // Post-query filters on computed fields
            const filtered = customers.filter(c => {
                if (minBookings && c.totalBookings < minBookings)
                    return false;
                if (minSpend && c.totalSpend < minSpend)
                    return false;
                return true;
            });
            return { customers: filtered, total: (minBookings || minSpend) ? filtered.length : (count || 0) };
        });
    }
    /**
     * Get detailed customer profile
     */
    getCustomerDetails(locationId, customerId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify the customer has a relationship with this location
            // Check 1: profile registered at this location
            const { count: profileCount } = yield database_1.supabase
                .from('user_profiles')
                .select('id', { count: 'exact', head: true })
                .eq('id', customerId)
                .eq('location_id', locationId);
            if (!profileCount || profileCount === 0) {
                // Check 2: has bookings at this location
                const { count: bookingCount } = yield database_1.supabase
                    .from('bookings')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', customerId)
                    .eq('location_id', locationId);
                // Check 3: has memberships at this location
                const { count: membershipCount } = yield database_1.supabase
                    .from('memberships')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', customerId)
                    .eq('location_id', locationId);
                if ((bookingCount !== null && bookingCount !== void 0 ? bookingCount : 0) === 0 && (membershipCount !== null && membershipCount !== void 0 ? membershipCount : 0) === 0) {
                    throw new Error('Customer not found at this location');
                }
            }
            // Fetch profile
            const { data: profile, error: profileError } = yield database_1.supabase
                .from('user_profiles')
                .select('*')
                .eq('id', customerId)
                .single();
            if (profileError)
                throw profileError;
            // Fetch bookings for this location
            const { data: bookings, error: bookingsError } = yield database_1.supabase
                .from('bookings')
                .select(`
                id, 
                start_time, 
                total_amount, 
                status, 
                bays (name)
            `)
                .eq('user_id', customerId)
                .eq('location_id', locationId)
                .order('start_time', { ascending: false });
            if (bookingsError)
                throw bookingsError;
            const allBookings = bookings || [];
            const confirmedBookings = allBookings.filter(b => b.status === 'confirmed');
            // Stats
            const totalBookings = confirmedBookings.length;
            const totalSpend = confirmedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
            const lifetimeValue = totalSpend;
            const averageOrderValue = totalBookings > 0 ? totalSpend / totalBookings : 0;
            const cancelledCount = allBookings.filter(b => b.status === 'cancelled').length;
            const cancellationRate = allBookings.length > 0 ? (cancelledCount / allBookings.length) * 100 : 0;
            let lastVisit = null;
            if (confirmedBookings.length > 0) {
                lastVisit = confirmedBookings[0].start_time; // Already sorted desc
            }
            const recentBookings = allBookings.map((b) => {
                var _a;
                return ({
                    id: b.id,
                    date: b.start_time,
                    bayName: ((_a = b.bays) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Bay',
                    status: b.status,
                    amount: b.total_amount || 0,
                });
            });
            // Fetch membership for this user at this location
            const { data: membership } = yield database_1.supabase
                .from('memberships')
                .select(`
                id, status, billing_interval, current_period_end, canceled_at,
                free_minutes_used, guest_passes_used, plan_id,
                membership_plans (id, name, monthly_price, annual_price, benefits)
            `)
                .eq('user_id', customerId)
                .eq('location_id', locationId)
                .in('status', ['active', 'trialing', 'past_due', 'canceled'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            return {
                id: profile.id,
                email: profile.email,
                fullName: profile.full_name,
                phone: profile.phone,
                userType: profile.user_type || 'regular',
                createdAt: profile.created_at,
                totalBookings,
                totalSpend,
                lastVisit,
                recentBookings,
                stats: {
                    lifetimeValue,
                    averageOrderValue,
                    cancellationRate,
                    memberSince: profile.created_at,
                },
                membership: membership || null,
            };
        });
    }
    updateCustomer(id, updates, locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify the customer has a relationship with this location
            const { count: profileCount } = yield database_1.supabase
                .from('user_profiles')
                .select('id', { count: 'exact', head: true })
                .eq('id', id)
                .eq('location_id', locationId);
            if (!profileCount || profileCount === 0) {
                const { count: bookingCount } = yield database_1.supabase
                    .from('bookings')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', id)
                    .eq('location_id', locationId);
                const { count: membershipCount } = yield database_1.supabase
                    .from('memberships')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', id)
                    .eq('location_id', locationId);
                if ((bookingCount !== null && bookingCount !== void 0 ? bookingCount : 0) === 0 && (membershipCount !== null && membershipCount !== void 0 ? membershipCount : 0) === 0) {
                    throw new Error('Customer not found at this location');
                }
            }
            const updateData = {
                full_name: updates.fullName,
                phone: updates.phone,
                email: updates.email,
            };
            if (updates.userType) {
                if (locationId) {
                    const { data: validType } = yield database_1.supabase
                        .from('user_types')
                        .select('slug')
                        .eq('location_id', locationId)
                        .eq('slug', updates.userType)
                        .single();
                    if (!validType) {
                        throw new Error(`Invalid user type: "${updates.userType}"`);
                    }
                }
                updateData.user_type = updates.userType;
            }
            const { error } = yield database_1.supabase
                .from('user_profiles')
                .update(updateData)
                .eq('id', id);
            if (error)
                throw error;
        });
    }
}
exports.EmployeeService = EmployeeService;
exports.employeeService = new EmployeeService();
