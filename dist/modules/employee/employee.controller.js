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
exports.employeeController = exports.EmployeeController = void 0;
const employee_service_1 = require("./employee.service");
/**
 * Validate query parameters for report endpoints
 */
function validateQueryParams(query) {
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
function createResponse(data, params) {
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
class EmployeeController {
    /**
     * GET /employee/reports/overview
     * Combined dashboard summary
     */
    getOverview(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = validateQueryParams(req.query);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: validation.error });
                }
                const { locationId, startDate, endDate } = validation.params;
                const data = yield employee_service_1.employeeService.getOverview(locationId, startDate, endDate);
                return res.json(createResponse(data, validation.params));
            }
            catch (error) {
                console.error('Error in getOverview:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/reports/revenue
     * Detailed revenue statistics
     */
    getRevenueStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = validateQueryParams(req.query);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: validation.error });
                }
                const { locationId, startDate, endDate } = validation.params;
                const data = yield employee_service_1.employeeService.getRevenueStats(locationId, startDate, endDate);
                return res.json(createResponse(data, validation.params));
            }
            catch (error) {
                console.error('Error in getRevenueStats:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/reports/bookings
     * Booking analytics
     */
    getBookingStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = validateQueryParams(req.query);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: validation.error });
                }
                const { locationId, startDate, endDate } = validation.params;
                const data = yield employee_service_1.employeeService.getBookingStats(locationId, startDate, endDate);
                return res.json(createResponse(data, validation.params));
            }
            catch (error) {
                console.error('Error in getBookingStats:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/reports/bays
     * Bay performance statistics
     */
    getBayStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = validateQueryParams(req.query);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: validation.error });
                }
                const { locationId, startDate, endDate } = validation.params;
                const data = yield employee_service_1.employeeService.getBayStats(locationId, startDate, endDate);
                return res.json(createResponse(data, validation.params));
            }
            catch (error) {
                console.error('Error in getBayStats:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/reports/access-logs
     * Access log statistics
     */
    getAccessLogStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = validateQueryParams(req.query);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: validation.error });
                }
                const { locationId, startDate, endDate } = validation.params;
                const data = yield employee_service_1.employeeService.getAccessLogStats(locationId, startDate, endDate);
                return res.json(createResponse(data, validation.params));
            }
            catch (error) {
                console.error('Error in getAccessLogStats:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/reports/export
     * Export report data as CSV
     */
    exportReport(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = validateQueryParams(req.query);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: validation.error });
                }
                const { locationId, startDate, endDate } = validation.params;
                const type = req.query.type;
                if (!type || !['revenue', 'bays'].includes(type)) {
                    return res.status(400).json({ success: false, error: 'Invalid export type. Must be "revenue" or "bays"' });
                }
                const csv = yield employee_service_1.employeeService.exportCSV(locationId, startDate, endDate, type);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${startDate}-${endDate}.csv`);
                return res.send(csv);
            }
            catch (error) {
                console.error('Error in exportReport:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/customers
     * Get paginated customer list
     */
    getCustomers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, page, pageSize, search, sortBy, sortOrder } = req.query;
                if (!locationId) {
                    return res.status(400).json({ success: false, error: 'locationId is required' });
                }
                const data = yield employee_service_1.employeeService.getCustomers(locationId, {
                    page: page ? parseInt(page) : 1,
                    pageSize: pageSize ? parseInt(pageSize) : 10,
                    search: search,
                    sortBy: sortBy,
                    sortOrder: sortOrder,
                });
                return res.json({
                    success: true,
                    data: data.customers,
                    total: data.total,
                    page: page ? parseInt(page) : 1,
                    pageSize: pageSize ? parseInt(pageSize) : 10,
                });
            }
            catch (error) {
                console.error('Error in getCustomers:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * GET /employee/customers/:id
     * Get detailed customer profile and history
     */
    getCustomerDetails(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                const { id } = req.params;
                if (!locationId) {
                    return res.status(400).json({ success: false, error: 'locationId is required' });
                }
                const data = yield employee_service_1.employeeService.getCustomerDetails(locationId, id);
                return res.json({ success: true, data });
            }
            catch (error) {
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
    /**
     * PUT /employee/customers/:id
     * Update customer details
     */
    updateCustomer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const { fullName, phone, email } = req.body;
                yield employee_service_1.employeeService.updateCustomer(id, { fullName, phone, email });
                return res.json({ success: true });
            }
            catch (error) {
                console.error('Error in updateCustomer:', error);
                return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
            }
        });
    }
}
exports.EmployeeController = EmployeeController;
exports.employeeController = new EmployeeController();
