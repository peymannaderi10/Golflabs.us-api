"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeRoutes = void 0;
const express_1 = require("express");
const employee_controller_1 = require("./employee.controller");
const router = (0, express_1.Router)();
// All routes require locationId, startDate, and endDate query parameters
// Example: GET /employee/reports/overview?locationId=xxx&startDate=2024-01-01&endDate=2024-01-31
/**
 * GET /employee/reports/overview
 * Combined dashboard summary with key metrics
 */
router.get('/reports/overview', (req, res) => employee_controller_1.employeeController.getOverview(req, res));
/**
 * GET /employee/reports/revenue
 * Detailed revenue statistics with daily breakdown
 */
router.get('/reports/revenue', (req, res) => employee_controller_1.employeeController.getRevenueStats(req, res));
/**
 * GET /employee/reports/bookings
 * Booking analytics including hourly distribution for heatmap
 */
router.get('/reports/bookings', (req, res) => employee_controller_1.employeeController.getBookingStats(req, res));
/**
 * GET /employee/reports/bays
 * Bay performance and utilization statistics
 */
router.get('/reports/bays', (req, res) => employee_controller_1.employeeController.getBayStats(req, res));
/**
 * GET /employee/reports/access-logs
 * Access log statistics including success rates and common errors
 */
router.get('/reports/access-logs', (req, res) => employee_controller_1.employeeController.getAccessLogStats(req, res));
/**
 * GET /employee/reports/export
 * Export reports as CSV
 */
router.get('/reports/export', (req, res) => employee_controller_1.employeeController.exportReport(req, res));
/**
 * GET /employee/customers
 * List customers (paginated)
 */
router.get('/customers', (req, res) => employee_controller_1.employeeController.getCustomers(req, res));
/**
 * GET /employee/customers/:id
 * Get customer details
 */
router.get('/customers/:id', (req, res) => employee_controller_1.employeeController.getCustomerDetails(req, res));
/**
 * PUT /employee/customers/:id
 * Update customer details
 */
router.put('/customers/:id', (req, res) => employee_controller_1.employeeController.updateCustomer(req, res));
exports.employeeRoutes = router;
