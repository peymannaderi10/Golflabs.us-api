import { Request, Response } from 'express';
import { employeeService } from './employee.service';
import { ReportResponse, ReportQueryParams } from './employee.types';

/**
 * Validate query parameters for report endpoints
 */
function validateQueryParams(query: any): { valid: boolean; error?: string; params?: ReportQueryParams } {
    const { locationId, startDate, endDate } = query;

    if (!locationId) {
        return { valid: false, error: 'locationId is required' };
    }

    if (!startDate || !endDate) {
        return { valid: false, error: 'startDate and endDate are required (YYYY-MM-DD format)' };
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return { valid: false, error: 'Dates must be in YYYY-MM-DD format' };
    }

    return {
        valid: true,
        params: { locationId, startDate, endDate },
    };
}

/**
 * Helper to create standardized response
 */
function createResponse<T>(data: T, params: ReportQueryParams): ReportResponse<T> {
    return {
        success: true,
        data,
        dateRange: {
            start: params.startDate,
            end: params.endDate,
        },
        locationId: params.locationId,
        generatedAt: new Date().toISOString(),
    };
}

export class EmployeeController {
    /**
     * GET /employee/reports/overview
     * Combined dashboard summary
     */
    async getOverview(req: Request, res: Response) {
        try {
            const validation = validateQueryParams(req.query);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { locationId, startDate, endDate } = validation.params!;
            const data = await employeeService.getOverview(locationId, startDate, endDate);

            return res.json(createResponse(data, validation.params!));
        } catch (error: any) {
            console.error('Error in getOverview:', error);
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    }

    /**
     * GET /employee/reports/revenue
     * Detailed revenue statistics
     */
    async getRevenueStats(req: Request, res: Response) {
        try {
            const validation = validateQueryParams(req.query);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { locationId, startDate, endDate } = validation.params!;
            const data = await employeeService.getRevenueStats(locationId, startDate, endDate);

            return res.json(createResponse(data, validation.params!));
        } catch (error: any) {
            console.error('Error in getRevenueStats:', error);
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    }

    /**
     * GET /employee/reports/bookings
     * Booking analytics
     */
    async getBookingStats(req: Request, res: Response) {
        try {
            const validation = validateQueryParams(req.query);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { locationId, startDate, endDate } = validation.params!;
            const data = await employeeService.getBookingStats(locationId, startDate, endDate);

            return res.json(createResponse(data, validation.params!));
        } catch (error: any) {
            console.error('Error in getBookingStats:', error);
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    }

    /**
     * GET /employee/reports/bays
     * Bay performance statistics
     */
    async getBayStats(req: Request, res: Response) {
        try {
            const validation = validateQueryParams(req.query);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { locationId, startDate, endDate } = validation.params!;
            const data = await employeeService.getBayStats(locationId, startDate, endDate);

            return res.json(createResponse(data, validation.params!));
        } catch (error: any) {
            console.error('Error in getBayStats:', error);
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    }

    /**
     * GET /employee/reports/access-logs
     * Access log statistics
     */
    async getAccessLogStats(req: Request, res: Response) {
        try {
            const validation = validateQueryParams(req.query);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { locationId, startDate, endDate } = validation.params!;
            const data = await employeeService.getAccessLogStats(locationId, startDate, endDate);

            return res.json(createResponse(data, validation.params!));
        } catch (error: any) {
            console.error('Error in getAccessLogStats:', error);
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    }

    /**
     * GET /employee/reports/export
     * Export report data as CSV
     */
    async exportReport(req: Request, res: Response) {
        try {
            const validation = validateQueryParams(req.query);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { locationId, startDate, endDate } = validation.params!;
            const type = req.query.type as 'revenue' | 'bays';

            if (!type || !['revenue', 'bays'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid export type. Must be "revenue" or "bays"' });
            }

            const csv = await employeeService.exportCSV(locationId, startDate, endDate, type);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${startDate}-${endDate}.csv`);
            return res.send(csv);
        } catch (error: any) {
            console.error('Error in exportReport:', error);
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    }
}

export const employeeController = new EmployeeController();
