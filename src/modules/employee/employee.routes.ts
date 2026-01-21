import { Router } from 'express';
import { employeeController } from './employee.controller';

const router = Router();

// All routes require locationId, startDate, and endDate query parameters
// Example: GET /employee/reports/overview?locationId=xxx&startDate=2024-01-01&endDate=2024-01-31

/**
 * GET /employee/reports/overview
 * Combined dashboard summary with key metrics
 */
router.get('/reports/overview', (req, res) => employeeController.getOverview(req, res));

/**
 * GET /employee/reports/revenue
 * Detailed revenue statistics with daily breakdown
 */
router.get('/reports/revenue', (req, res) => employeeController.getRevenueStats(req, res));

/**
 * GET /employee/reports/bookings
 * Booking analytics including hourly distribution for heatmap
 */
router.get('/reports/bookings', (req, res) => employeeController.getBookingStats(req, res));

/**
 * GET /employee/reports/bays
 * Bay performance and utilization statistics
 */
router.get('/reports/bays', (req, res) => employeeController.getBayStats(req, res));

/**
 * GET /employee/reports/access-logs
 * Access log statistics including success rates and common errors
 */
router.get('/reports/access-logs', (req, res) => employeeController.getAccessLogStats(req, res));

/**
 * GET /employee/reports/export
 * Export reports as CSV
 */
router.get('/reports/export', (req, res) => employeeController.exportReport(req, res));

export const employeeRoutes = router;
