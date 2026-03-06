import { Router } from 'express';
import { MembershipController } from './membership.controller';
import { authenticateUser, authenticateEmployee } from '../auth/auth.middleware';

export const membershipRoutes = Router();

const controller = new MembershipController();

// Public: list plans for a location
membershipRoutes.get('/plans', controller.getPlans);

// Customer: own membership
membershipRoutes.get('/my', authenticateUser, controller.getMyMembership);
membershipRoutes.post('/subscribe', authenticateUser, controller.subscribe);
membershipRoutes.post('/:membershipId/cancel', authenticateUser, controller.cancel);
membershipRoutes.post('/:membershipId/change-plan', authenticateUser, controller.changePlan);

// Employee: plan management
membershipRoutes.post('/plans', authenticateEmployee, controller.createPlan);
membershipRoutes.put('/plans/:planId', authenticateEmployee, controller.updatePlan);
membershipRoutes.delete('/plans/:planId', authenticateEmployee, controller.deactivatePlan);
membershipRoutes.get('/subscribers', authenticateEmployee, controller.getSubscribers);

// Employee: location membership settings
membershipRoutes.get('/settings/:locationId', authenticateEmployee, controller.getLocationSettings);
membershipRoutes.put('/settings/:locationId', authenticateEmployee, controller.updateLocationSettings);
