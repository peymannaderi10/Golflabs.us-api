"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.membershipRoutes = void 0;
const express_1 = require("express");
const membership_controller_1 = require("./membership.controller");
const auth_middleware_1 = require("../auth/auth.middleware");
exports.membershipRoutes = (0, express_1.Router)();
const controller = new membership_controller_1.MembershipController();
// Public: list plans for a location
exports.membershipRoutes.get('/plans', controller.getPlans);
// Customer: own membership
exports.membershipRoutes.get('/my', auth_middleware_1.authenticateUser, controller.getMyMembership);
exports.membershipRoutes.post('/subscribe', auth_middleware_1.authenticateUser, controller.subscribe);
exports.membershipRoutes.post('/:membershipId/cancel', auth_middleware_1.authenticateUser, controller.cancel);
exports.membershipRoutes.post('/:membershipId/change-plan', auth_middleware_1.authenticateUser, controller.changePlan);
// Employee: plan management
exports.membershipRoutes.post('/plans', auth_middleware_1.authenticateEmployee, controller.createPlan);
exports.membershipRoutes.put('/plans/:planId', auth_middleware_1.authenticateEmployee, controller.updatePlan);
exports.membershipRoutes.delete('/plans/:planId', auth_middleware_1.authenticateEmployee, controller.deactivatePlan);
exports.membershipRoutes.get('/subscribers', auth_middleware_1.authenticateEmployee, controller.getSubscribers);
// Employee: location membership settings
exports.membershipRoutes.get('/settings/:locationId', auth_middleware_1.authenticateEmployee, controller.getLocationSettings);
exports.membershipRoutes.put('/settings/:locationId', auth_middleware_1.authenticateEmployee, controller.updateLocationSettings);
