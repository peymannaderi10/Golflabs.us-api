import { supabase } from '../../config/database';
import { createISOTimestamp } from '../../shared/utils/date.utils';
import {
    RevenueStats,
    BookingStats,
    BayStats,
    BayPerformance,
    AccessLogStats,
    ReportOverview,
    DailyRevenue,
    HourlyBookingCount,
    Customer,
    CustomerSearchParams,
    CustomerDetails,
} from './employee.types';

export class EmployeeService {
    /**
     * Get revenue statistics for a location within a date range
     */
    async getRevenueStats(locationId: string, startDate: string, endDate: string): Promise<RevenueStats> {
        // Get location timezone
        const { data: location } = await supabase
            .from('locations')
            .select('timezone')
            .eq('id', locationId)
            .single();

        const timezone = location?.timezone || 'America/New_York';
        const startUTC = createISOTimestamp(startDate, '12:00 AM', timezone);
        const endUTC = createISOTimestamp(endDate, '11:59 PM', timezone);

        // Get all successful payments within the date range for this location
        const { data: payments, error } = await supabase
            .from('payments')
            .select('amount, processed_at, booking_id')
            .eq('location_id', locationId)
            .eq('status', 'succeeded')
            .gte('processed_at', startUTC)
            .lte('processed_at', endUTC)
            .order('processed_at', { ascending: true });

        if (error) {
            console.error('Error fetching revenue stats:', error);
            throw error;
        }

        // Aggregate daily revenue
        const dailyRevenueMap = new Map<string, { revenue: number; bookingCount: number }>();
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

        const dailyRevenue: DailyRevenue[] = Array.from(dailyRevenueMap.entries())
            .map(([date, data]) => ({
                date,
                revenue: data.revenue,
                bookingCount: data.bookingCount,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const totalBookings = payments?.length || 0;
        const averageOrderValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

        return {
            totalRevenue,
            averageOrderValue,
            totalBookings,
            dailyRevenue,
        };
    }

    /**
     * Get booking statistics for a location within a date range
     */
    async getBookingStats(locationId: string, startDate: string, endDate: string): Promise<BookingStats> {
        // Get location timezone
        const { data: location } = await supabase
            .from('locations')
            .select('timezone')
            .eq('id', locationId)
            .single();

        const timezone = location?.timezone || 'America/New_York';
        const startUTC = createISOTimestamp(startDate, '12:00 AM', timezone);
        const endUTC = createISOTimestamp(endDate, '11:59 PM', timezone);

        // Get all bookings (excluding abandoned) within the date range
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('id, start_time, end_time, status, party_size')
            .eq('location_id', locationId)
            .gte('start_time', startUTC)
            .lte('start_time', endUTC)
            .neq('status', 'abandoned')
            .neq('status', 'expired');

        if (error) {
            console.error('Error fetching booking stats:', error);
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
        const hourlyDistribution: HourlyBookingCount[] = [];
        const hourlyMap = new Map<string, number>();

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
    }

    /**
     * Get bay performance statistics for a location within a date range
     */
    async getBayStats(locationId: string, startDate: string, endDate: string): Promise<BayStats> {
        // Get location timezone
        const { data: location } = await supabase
            .from('locations')
            .select('timezone')
            .eq('id', locationId)
            .single();

        const timezone = location?.timezone || 'America/New_York';
        const startUTC = createISOTimestamp(startDate, '12:00 AM', timezone);
        const endUTC = createISOTimestamp(endDate, '11:59 PM', timezone);

        // Get all bays for this location
        const { data: bays, error: baysError } = await supabase
            .from('bays')
            .select('id, bay_number, name')
            .eq('location_id', locationId)
            .is('deleted_at', null)
            .order('bay_number');

        if (baysError) {
            console.error('Error fetching bays:', baysError);
            throw baysError;
        }

        // Get confirmed bookings for each bay
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('bay_id, start_time, end_time, total_amount')
            .eq('location_id', locationId)
            .eq('status', 'confirmed')
            .gte('start_time', startUTC)
            .lte('start_time', endUTC);

        if (bookingsError) {
            console.error('Error fetching bay bookings:', bookingsError);
            throw bookingsError;
        }

        // Calculate operating hours for utilization calculation
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        // Assume 14 hours of operation per day (e.g., 9am-11pm)
        const totalAvailableHoursPerBay = daysDiff * 14;

        // Aggregate by bay
        const bayPerformanceMap = new Map<string, { hoursBooked: number; bookings: number; revenue: number }>();

        (bookings || []).forEach((booking) => {
            const bayId = booking.bay_id;
            if (!bayId) return;

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
        const bayPerformance: BayPerformance[] = (bays || []).map((bay) => {
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
            totalBays: bays?.length || 0,
            averageUtilization: Math.round(averageUtilization * 10) / 10,
            topPerformingBay,
        };
    }

    /**
     * Get access log statistics for a location within a date range
     */
    async getAccessLogStats(locationId: string, startDate: string, endDate: string): Promise<AccessLogStats> {
        // Get location timezone
        const { data: location } = await supabase
            .from('locations')
            .select('timezone')
            .eq('id', locationId)
            .single();

        const timezone = location?.timezone || 'America/New_York';
        const startUTC = createISOTimestamp(startDate, '12:00 AM', timezone);
        const endUTC = createISOTimestamp(endDate, '11:59 PM', timezone);

        // Get access logs for this location
        const { data: logs, error } = await supabase
            .from('access_logs')
            .select('action, success, error_message, response_time_ms, unlock_method')
            .eq('location_id', locationId)
            .gte('timestamp', startUTC)
            .lte('timestamp', endUTC);

        if (error) {
            console.error('Error fetching access logs:', error);
            throw error;
        }

        const allLogs = logs || [];
        const unlockLogs = allLogs.filter(l => l.action === 'unlock' || l.action === 'door_unlock');
        const successfulUnlocks = unlockLogs.filter(l => l.success).length;
        const failedUnlocks = unlockLogs.filter(l => !l.success).length;
        const totalUnlockAttempts = unlockLogs.length;
        const successRate = totalUnlockAttempts > 0 ? (successfulUnlocks / totalUnlockAttempts) * 100 : 100;

        // Calculate average response time
        const responseTimes = unlockLogs.filter(l => l.response_time_ms).map(l => l.response_time_ms!);
        const averageResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
            : 0;

        // Aggregate unlock methods
        const methodMap = new Map<string, number>();
        unlockLogs.forEach((log) => {
            const method = log.unlock_method || 'unknown';
            methodMap.set(method, (methodMap.get(method) || 0) + 1);
        });

        const unlockMethodBreakdown = Array.from(methodMap.entries())
            .map(([method, count]) => ({ method, count }))
            .sort((a, b) => b.count - a.count);

        // Aggregate common errors
        const errorMap = new Map<string, number>();
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
    }

    /**
     * Get combined overview for dashboard
     */
    async getOverview(locationId: string, startDate: string, endDate: string): Promise<ReportOverview> {
        const [revenueStats, bookingStats, bayStats, accessLogStats] = await Promise.all([
            this.getRevenueStats(locationId, startDate, endDate),
            this.getBookingStats(locationId, startDate, endDate),
            this.getBayStats(locationId, startDate, endDate),
            this.getAccessLogStats(locationId, startDate, endDate),
        ]);

        // Find peak hour and busiest day from booking stats
        const hourCounts = new Map<number, number>();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayCounts = new Map<number, number>();

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
    }

    /**
     * Export report data as CSV
     */
    async exportCSV(locationId: string, startDate: string, endDate: string, type: 'revenue' | 'bays'): Promise<string> {
        if (type === 'revenue') {
            const stats = await this.getRevenueStats(locationId, startDate, endDate);
            const header = 'Date,Revenue,Bookings\n';
            const rows = stats.dailyRevenue.map(d => `${d.date},${d.revenue},${d.bookingCount}`).join('\n');
            return header + rows;
        } else if (type === 'bays') {
            const stats = await this.getBayStats(locationId, startDate, endDate);
            const header = 'Bay Number,Bay Name,Hours Booked,Bookings,Revenue,Utilization %\n';
            const rows = stats.bays.map(b => `${b.bayNumber},${b.bayName},${b.totalHoursBooked},${b.totalBookings},${b.revenue},${b.utilizationRate}`).join('\n');
            return header + rows;
        }
        return '';
    }

    /**
     * Get customers list with pagination and search
     */
    async getCustomers(locationId: string, params: CustomerSearchParams): Promise<{ customers: Customer[]; total: number }> {
        const { page = 1, pageSize = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = params;

        let query = supabase.from('user_profiles').select('*', { count: 'exact' });

        if (search) {
            query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
        }

        // Pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);

        // Sorting
        // Note: Sorting by computed fields (totalSpend, etc.) is not supported in this simple query
        // We fallback to createdAt or simple fields
        const sortColumn = sortBy === 'createdAt' ? 'created_at' : 'created_at';
        query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

        const { data: profiles, count, error } = await query;

        if (error) {
            console.error('Error fetching customers:', error);
            throw error;
        }

        // Fetch stats for these users at this location
        const customers: Customer[] = await Promise.all((profiles || []).map(async (profile) => {
            const { data: bookings } = await supabase
                .from('bookings')
                .select('total_amount, start_time')
                .eq('user_id', profile.id)
                .eq('location_id', locationId)
                .eq('status', 'confirmed');

            const totalBookings = bookings?.length || 0;
            const totalSpend = bookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

            // Find last visit
            let lastVisit = null;
            if (bookings && bookings.length > 0) {
                // simple sort to find latest
                const times = bookings.map(b => b.start_time).sort();
                lastVisit = times[times.length - 1];
            }

            return {
                id: profile.id,
                email: profile.email,
                fullName: profile.full_name,
                phone: profile.phone,
                createdAt: profile.created_at,
                totalBookings,
                totalSpend,
                lastVisit,
            };
        }));

        return { customers, total: count || 0 };
    }

    /**
     * Get detailed customer profile
     */
    async getCustomerDetails(locationId: string, customerId: string): Promise<CustomerDetails> {
        // Fetch profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', customerId)
            .single();

        if (profileError) throw profileError;

        // Fetch bookings for this location
        const { data: bookings, error: bookingsError } = await supabase
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

        if (bookingsError) throw bookingsError;

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

        const recentBookings = allBookings.map((b: any) => ({
            id: b.id,
            date: b.start_time,
            bayName: b.bays?.name || 'Unknown Bay',
            status: b.status,
            amount: b.total_amount || 0,
        }));

        return {
            id: profile.id,
            email: profile.email,
            fullName: profile.full_name,
            phone: profile.phone,
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
            }
        };
    }
    async updateCustomer(id: string, updates: { fullName?: string; phone?: string; email?: string }): Promise<void> {
        const { error } = await supabase
            .from('user_profiles')
            .update({
                full_name: updates.fullName,
                phone: updates.phone,
                email: updates.email
            })
            .eq('id', id);

        if (error) throw error;
    }
}

export const employeeService = new EmployeeService();
