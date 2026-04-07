"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeRoutes = void 0;
const express_1 = require("express");
const employee_controller_1 = require("./employee.controller");
const location_controller_1 = require("../locations/location.controller");
const pricing_controller_1 = require("../pricing/pricing.controller");
const log_controller_1 = require("../logs/log.controller");
const user_types_controller_1 = require("../user-types/user-types.controller");
const auth_1 = require("../auth");
const router = (0, express_1.Router)();
const locationController = new location_controller_1.LocationController();
const pricingController = new pricing_controller_1.PricingController();
const logController = new log_controller_1.LogController();
// FRONT DOOR: every route authenticates first.
router.use(auth_1.authenticateEmployee);
// Resource-param resolvers (resolves DB row → locationId → req.targetLocationId).
const scopePricingRule = [(0, auth_1.resolveResourceLocation)('pricing_rules', 'ruleId'), auth_1.enforceLocationScope];
const scopeUserType = [(0, auth_1.resolveResourceLocation)('user_types', 'id'), auth_1.enforceLocationScope];
/** Self-scoped: identity only, no location dimension. */
router.get('/accessible-locations', auth_1.enforceLocationScopeOptional, (req, res) => locationController.getAccessibleLocations(req, res));
// All routes below are fail-closed: `enforceLocationScope` requires a
// locationId to be resolvable from params/body/query/targetLocationId.
// Reports
router.get('/reports/overview', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getOverview(req, res));
router.get('/reports/revenue', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getRevenueStats(req, res));
router.get('/reports/bookings', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getBookingStats(req, res));
router.get('/reports/spaces', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getSpaceStats(req, res));
router.get('/reports/access-logs', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getAccessLogStats(req, res));
router.get('/reports/export', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.exportReport(req, res));
// Customers
router.get('/customers', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getCustomers(req, res));
router.get('/customers/:id', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.getCustomerDetails(req, res));
router.put('/customers/:id', auth_1.enforceLocationScope, (req, res) => employee_controller_1.employeeController.updateCustomer(req, res));
// Locations (update)
router.put('/locations/:locationId', auth_1.enforceLocationScope, (req, res) => locationController.updateLocation(req, res));
// Pricing rules
router.get('/pricing-rules', auth_1.enforceLocationScope, (req, res) => pricingController.getAllPricingRules(req, res));
router.post('/locations/:locationId/pricing-rules', auth_1.enforceLocationScope, (req, res) => pricingController.createPricingRule(req, res));
router.put('/pricing-rules/:ruleId', ...scopePricingRule, (req, res) => pricingController.updatePricingRule(req, res));
router.delete('/pricing-rules/:ruleId', ...scopePricingRule, (req, res) => pricingController.deletePricingRule(req, res));
// Access logs
router.get('/access-logs', auth_1.enforceLocationScope, (req, res) => logController.getAccessLogs(req, res));
// User types
router.get('/user-types', auth_1.enforceLocationScope, (req, res) => user_types_controller_1.userTypesController.getByLocation(req, res));
router.post('/locations/:locationId/user-types', auth_1.enforceLocationScope, (req, res) => user_types_controller_1.userTypesController.create(req, res));
router.put('/user-types/:id', ...scopeUserType, (req, res) => user_types_controller_1.userTypesController.update(req, res));
router.delete('/user-types/:id', ...scopeUserType, (req, res) => user_types_controller_1.userTypesController.delete(req, res));
exports.employeeRoutes = router;
