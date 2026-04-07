import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { MembershipController } from './membership.controller';
import { authenticateUser, authenticateEmployee, enforceLocationScope, resolveResourceLocation } from '../auth/auth.middleware';
import { handleValidationErrors } from '../../shared/middleware/validation';

export const membershipRoutes = Router();

const controller = new MembershipController();

// Resource-param resolvers for routes identifying a row by its own id.
const scopePlan = [resolveResourceLocation('membership_plans', 'planId'), enforceLocationScope];
const scopeMembership = [resolveResourceLocation('memberships', 'membershipId'), enforceLocationScope];

// Public: list plans for a location
membershipRoutes.get('/plans', controller.getPlans);

// Customer: own membership
membershipRoutes.get('/my', authenticateUser, controller.getMyMembership);
membershipRoutes.post('/billing-portal', authenticateUser, [
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('returnUrl').isURL({ require_tld: false }).withMessage('returnUrl must be a valid URL'),
  handleValidationErrors,
], controller.createBillingPortalSession);

membershipRoutes.post('/subscribe', authenticateUser, [
  body('planId').isUUID().withMessage('planId must be a valid UUID'),
  body('billingInterval').isIn(['monthly', 'annual']).withMessage('billingInterval must be monthly or annual'),
  handleValidationErrors,
], controller.subscribe);
membershipRoutes.post('/:membershipId/change-plan', authenticateUser, [
  param('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
  body('newPlanId').isUUID().withMessage('newPlanId must be a valid UUID'),
  handleValidationErrors,
], controller.changePlan);

// Employee: plan management — every route is authenticated + scoped.
// Resource-param routes resolve locationId from the row they target.
membershipRoutes.post('/plans', authenticateEmployee, enforceLocationScope, [
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('name').isString().notEmpty().withMessage('name is required'),
  handleValidationErrors,
], controller.createPlan);
membershipRoutes.put('/plans/:planId', authenticateEmployee, [
  param('planId').isUUID().withMessage('planId must be a valid UUID'),
  handleValidationErrors,
], ...scopePlan, controller.updatePlan);
membershipRoutes.delete('/plans/:planId', authenticateEmployee, [
  param('planId').isUUID().withMessage('planId must be a valid UUID'),
  handleValidationErrors,
], ...scopePlan, controller.deactivatePlan);
membershipRoutes.get('/subscribers', authenticateEmployee, enforceLocationScope, controller.getSubscribers);
membershipRoutes.post('/manage/:membershipId/cancel', authenticateEmployee, [
  param('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
  handleValidationErrors,
], ...scopeMembership, controller.employeeCancelMembership);
membershipRoutes.post('/manage/:membershipId/change-plan', authenticateEmployee, [
  param('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
  body('newPlanId').isUUID().withMessage('newPlanId must be a valid UUID'),
  handleValidationErrors,
], ...scopeMembership, controller.employeeChangePlan);

// Employee: location membership settings — `locationId` is a route param,
// so the generic `enforceLocationScope` reads it from req.params directly.
membershipRoutes.get('/settings/:locationId', authenticateEmployee, enforceLocationScope, [
  param('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
], controller.getLocationSettings);
membershipRoutes.put('/settings/:locationId', authenticateEmployee, enforceLocationScope, [
  param('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
], controller.updateLocationSettings);
