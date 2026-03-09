import { Router } from 'express';
import { employeeController } from './employee.controller';
import { LocationController } from '../locations/location.controller';
import { PricingController } from '../pricing/pricing.controller';
import { LogController } from '../logs/log.controller';
import { userTypesController } from '../user-types/user-types.controller';
import { authenticateEmployee } from '../auth';

const router = Router();
const locationController = new LocationController();
const pricingController = new PricingController();
const logController = new LogController();

// All routes require locationId, startDate, and endDate query parameters
// Example: GET /employee/reports/overview?locationId=xxx&startDate=2024-01-01&endDate=2024-01-31

/**
 * GET /employee/reports/overview
 * Combined dashboard summary with key metrics
 */
router.get('/reports/overview', authenticateEmployee, (req, res) => employeeController.getOverview(req, res));

/**
 * GET /employee/reports/revenue
 * Detailed revenue statistics with daily breakdown
 */
router.get('/reports/revenue', authenticateEmployee, (req, res) => employeeController.getRevenueStats(req, res));

/**
 * GET /employee/reports/bookings
 * Booking analytics including hourly distribution for heatmap
 */
router.get('/reports/bookings', authenticateEmployee, (req, res) => employeeController.getBookingStats(req, res));

/**
 * GET /employee/reports/bays
 * Bay performance and utilization statistics
 */
router.get('/reports/bays', authenticateEmployee, (req, res) => employeeController.getBayStats(req, res));

/**
 * GET /employee/reports/access-logs
 * Access log statistics including success rates and common errors
 */
router.get('/reports/access-logs', authenticateEmployee, (req, res) => employeeController.getAccessLogStats(req, res));

/**
 * GET /employee/reports/export
 * Export reports as CSV
 */
router.get('/reports/export', authenticateEmployee, (req, res) => employeeController.exportReport(req, res));

/**
 * GET /employee/customers
 * List customers (paginated)
 */
router.get('/customers', authenticateEmployee, (req, res) => employeeController.getCustomers(req, res));

/**
 * GET /employee/customers/:id
 * Get customer details
 */
router.get('/customers/:id', authenticateEmployee, (req, res) => employeeController.getCustomerDetails(req, res));

/**
 * PUT /employee/customers/:id
 * Update customer details
 */
router.put('/customers/:id', authenticateEmployee, (req, res) => employeeController.updateCustomer(req, res));

/**
 * PUT /employee/locations/:locationId
 * Update location settings (requires employee authentication)
 */
router.put('/locations/:locationId', authenticateEmployee, (req, res) => locationController.updateLocation(req, res));

/**
 * GET /employee/pricing-rules
 * Get all pricing rules for a location (requires employee authentication)
 */
router.get('/pricing-rules', authenticateEmployee, (req, res) => pricingController.getAllPricingRules(req, res));

/**
 * POST /employee/locations/:locationId/pricing-rules
 * Create a new pricing rule (requires employee authentication)
 */
router.post('/locations/:locationId/pricing-rules', authenticateEmployee, (req, res) => pricingController.createPricingRule(req, res));

/**
 * PUT /employee/pricing-rules/:ruleId
 * Update a pricing rule (requires employee authentication)
 */
router.put('/pricing-rules/:ruleId', authenticateEmployee, (req, res) => pricingController.updatePricingRule(req, res));

/**
 * DELETE /employee/pricing-rules/:ruleId
 * Delete a pricing rule (requires employee authentication)
 */
router.delete('/pricing-rules/:ruleId', authenticateEmployee, (req, res) => pricingController.deletePricingRule(req, res));

/**
 * GET /employee/access-logs
 * Get access logs for a location (requires employee authentication)
 */
router.get('/access-logs', authenticateEmployee, (req, res) => logController.getAccessLogs(req, res));

/**
 * GET /employee/user-types?locationId=...
 * List user types for a location
 */
router.get('/user-types', authenticateEmployee, (req, res) => userTypesController.getByLocation(req, res));

/**
 * POST /employee/locations/:locationId/user-types
 * Create a new user type
 */
router.post('/locations/:locationId/user-types', authenticateEmployee, (req, res) => userTypesController.create(req, res));

/**
 * PUT /employee/user-types/:id
 * Update a user type
 */
router.put('/user-types/:id', authenticateEmployee, (req, res) => userTypesController.update(req, res));

/**
 * DELETE /employee/user-types/:id
 * Delete a user type
 */
router.delete('/user-types/:id', authenticateEmployee, (req, res) => userTypesController.delete(req, res));

export const employeeRoutes = router;
