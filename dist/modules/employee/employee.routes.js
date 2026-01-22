"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeRoutes = void 0;
const express_1 = require("express");
const employee_controller_1 = require("./employee.controller");
const location_controller_1 = require("../locations/location.controller");
const pricing_controller_1 = require("../pricing/pricing.controller");
const log_controller_1 = require("../logs/log.controller");
const employee_middleware_1 = require("../bookings/employee.middleware");
const router = (0, express_1.Router)();
const locationController = new location_controller_1.LocationController();
const pricingController = new pricing_controller_1.PricingController();
const logController = new log_controller_1.LogController();
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
/**
 * PUT /employee/locations/:locationId
 * Update location settings (requires employee authentication)
 */
router.put('/locations/:locationId', employee_middleware_1.authenticateEmployee, (req, res) => locationController.updateLocation(req, res));
/**
 * GET /employee/pricing-rules
 * Get all pricing rules for a location (requires employee authentication)
 */
router.get('/pricing-rules', employee_middleware_1.authenticateEmployee, (req, res) => pricingController.getAllPricingRules(req, res));
/**
 * POST /employee/locations/:locationId/pricing-rules
 * Create a new pricing rule (requires employee authentication)
 */
router.post('/locations/:locationId/pricing-rules', employee_middleware_1.authenticateEmployee, (req, res) => pricingController.createPricingRule(req, res));
/**
 * PUT /employee/pricing-rules/:ruleId
 * Update a pricing rule (requires employee authentication)
 */
router.put('/pricing-rules/:ruleId', employee_middleware_1.authenticateEmployee, (req, res) => pricingController.updatePricingRule(req, res));
/**
 * DELETE /employee/pricing-rules/:ruleId
 * Delete a pricing rule (requires employee authentication)
 */
router.delete('/pricing-rules/:ruleId', employee_middleware_1.authenticateEmployee, (req, res) => pricingController.deletePricingRule(req, res));
/**
 * GET /employee/access-logs
 * Get access logs for a location (requires employee authentication)
 */
router.get('/access-logs', employee_middleware_1.authenticateEmployee, (req, res) => logController.getAccessLogs(req, res));
exports.employeeRoutes = router;
