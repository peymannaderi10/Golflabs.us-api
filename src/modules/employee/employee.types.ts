/**
 * Employee Reports Types
 * All types are location-specific - locationId is required for all queries
 */

// Date range for filtering reports
export interface DateRange {
    start: Date;
    end: Date;
}

// Query parameters for report endpoints
export interface ReportQueryParams {
    locationId: string;
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
}

// Revenue statistics
export interface DailyRevenue {
    date: string;
    revenue: number;
    bookingCount: number;
}

export interface RevenueStats {
    totalRevenue: number;
    averageOrderValue: number;
    totalBookings: number;
    dailyRevenue: DailyRevenue[];
    comparisonPeriod?: {
        totalRevenue: number;
        percentChange: number;
    };
}

// Booking statistics
export interface HourlyBookingCount {
    hour: number; // 0-23
    dayOfWeek: number; // 0=Sunday, 6=Saturday
    count: number;
}

export interface BookingStats {
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    pendingBookings: number;
    cancellationRate: number; // percentage
    averagePartySize: number;
    averageBookingDuration: number; // in minutes
    hourlyDistribution: HourlyBookingCount[];
}

// Bay performance statistics
export interface BayPerformance {
    bayId: string;
    bayNumber: number;
    bayName: string;
    totalHoursBooked: number;
    totalBookings: number;
    utilizationRate: number; // percentage based on available hours
    revenue: number;
}

export interface BayStats {
    bays: BayPerformance[];
    totalBays: number;
    averageUtilization: number;
    topPerformingBay: BayPerformance | null;
}

// Access log statistics
export interface AccessLogStats {
    totalUnlockAttempts: number;
    successfulUnlocks: number;
    failedUnlocks: number;
    successRate: number; // percentage
    averageResponseTime: number; // in milliseconds
    unlockMethodBreakdown: {
        method: string;
        count: number;
    }[];
    commonErrors: {
        errorMessage: string;
        count: number;
    }[];
}

// Combined overview for dashboard
export interface ReportOverview {
    revenue: {
        total: number;
        averageOrderValue: number;
        trend: number; // percentage change from previous period
    };
    bookings: {
        total: number;
        confirmed: number;
        cancelled: number;
        cancellationRate: number;
    };
    utilization: {
        averageRate: number;
        peakHour: number;
        busiestDay: string;
    };
    accessLogs: {
        successRate: number;
        totalAttempts: number;
    };
}

// API Response wrapper
export interface ReportResponse<T> {
    success: boolean;
    data: T;
    dateRange: {
        start: string;
        end: string;
    };
    locationId: string;
    generatedAt: string;
}
