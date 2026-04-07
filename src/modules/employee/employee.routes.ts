import { Router } from 'express';
import { employeeController } from './employee.controller';
import { LocationController } from '../locations/location.controller';
import { PricingController } from '../pricing/pricing.controller';
import { LogController } from '../logs/log.controller';
import { userTypesController } from '../user-types/user-types.controller';
import {
  authenticateEmployee,
  enforceLocationScope,
  enforceLocationScopeOptional,
  resolveResourceLocation,
} from '../auth';

const router = Router();
const locationController = new LocationController();
const pricingController = new PricingController();
const logController = new LogController();

// FRONT DOOR: every route authenticates first.
router.use(authenticateEmployee);

// Resource-param resolvers (resolves DB row → locationId → req.targetLocationId).
const scopePricingRule = [resolveResourceLocation('pricing_rules', 'ruleId'), enforceLocationScope];
const scopeUserType    = [resolveResourceLocation('user_types', 'id'),        enforceLocationScope];

/** Self-scoped: identity only, no location dimension. */
router.get('/accessible-locations', enforceLocationScopeOptional,
  (req, res) => locationController.getAccessibleLocations(req, res));

// All routes below are fail-closed: `enforceLocationScope` requires a
// locationId to be resolvable from params/body/query/targetLocationId.

// Reports
router.get('/reports/overview',     enforceLocationScope, (req, res) => employeeController.getOverview(req, res));
router.get('/reports/revenue',      enforceLocationScope, (req, res) => employeeController.getRevenueStats(req, res));
router.get('/reports/bookings',     enforceLocationScope, (req, res) => employeeController.getBookingStats(req, res));
router.get('/reports/spaces',       enforceLocationScope, (req, res) => employeeController.getSpaceStats(req, res));
router.get('/reports/access-logs',  enforceLocationScope, (req, res) => employeeController.getAccessLogStats(req, res));
router.get('/reports/export',       enforceLocationScope, (req, res) => employeeController.exportReport(req, res));

// Customers
router.get('/customers',            enforceLocationScope, (req, res) => employeeController.getCustomers(req, res));
router.get('/customers/:id',        enforceLocationScope, (req, res) => employeeController.getCustomerDetails(req, res));
router.put('/customers/:id',        enforceLocationScope, (req, res) => employeeController.updateCustomer(req, res));

// Locations (update)
router.put('/locations/:locationId', enforceLocationScope, (req, res) => locationController.updateLocation(req, res));

// Pricing rules
router.get('/pricing-rules',                        enforceLocationScope, (req, res) => pricingController.getAllPricingRules(req, res));
router.post('/locations/:locationId/pricing-rules', enforceLocationScope, (req, res) => pricingController.createPricingRule(req, res));
router.put('/pricing-rules/:ruleId',    ...scopePricingRule, (req, res) => pricingController.updatePricingRule(req, res));
router.delete('/pricing-rules/:ruleId', ...scopePricingRule, (req, res) => pricingController.deletePricingRule(req, res));

// Access logs
router.get('/access-logs', enforceLocationScope, (req, res) => logController.getAccessLogs(req, res));

// User types
router.get('/user-types',                            enforceLocationScope, (req, res) => userTypesController.getByLocation(req, res));
router.post('/locations/:locationId/user-types',     enforceLocationScope, (req, res) => userTypesController.create(req, res));
router.put('/user-types/:id',    ...scopeUserType, (req, res) => userTypesController.update(req, res));
router.delete('/user-types/:id', ...scopeUserType, (req, res) => userTypesController.delete(req, res));

export const employeeRoutes = router;
