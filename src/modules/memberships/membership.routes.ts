import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { MembershipController } from './membership.controller';
import { authenticateUser, authenticateEmployee } from '../auth/auth.middleware';
import { handleValidationErrors } from '../../shared/middleware/validation';

export const membershipRoutes = Router();

const controller = new MembershipController();

// Public: list plans for a location
membershipRoutes.get('/plans', controller.getPlans);

// Customer: own membership
membershipRoutes.get('/my', authenticateUser, controller.getMyMembership);
membershipRoutes.post('/subscribe', authenticateUser, [
  body('planId').isUUID().withMessage('planId must be a valid UUID'),
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('billingInterval').isIn(['monthly', 'annual']).withMessage('billingInterval must be monthly or annual'),
  handleValidationErrors,
], controller.subscribe);
membershipRoutes.post('/:membershipId/cancel', authenticateUser, [
  param('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
  handleValidationErrors,
], controller.cancel);
membershipRoutes.post('/:membershipId/change-plan', authenticateUser, [
  param('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
  body('newPlanId').isUUID().withMessage('newPlanId must be a valid UUID'),
  handleValidationErrors,
], controller.changePlan);

// Employee: plan management
membershipRoutes.post('/plans', authenticateEmployee, [
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('name').isString().notEmpty().withMessage('name is required'),
  handleValidationErrors,
], controller.createPlan);
membershipRoutes.put('/plans/:planId', authenticateEmployee, [
  param('planId').isUUID().withMessage('planId must be a valid UUID'),
  handleValidationErrors,
], controller.updatePlan);
membershipRoutes.delete('/plans/:planId', authenticateEmployee, [
  param('planId').isUUID().withMessage('planId must be a valid UUID'),
  handleValidationErrors,
], controller.deactivatePlan);
membershipRoutes.get('/subscribers', authenticateEmployee, controller.getSubscribers);

// Employee: location membership settings
membershipRoutes.get('/settings/:locationId', authenticateEmployee, [
  param('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
], controller.getLocationSettings);
membershipRoutes.put('/settings/:locationId', authenticateEmployee, [
  param('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  handleValidationErrors,
], controller.updateLocationSettings);
