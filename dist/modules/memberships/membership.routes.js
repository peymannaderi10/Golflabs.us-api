"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.membershipRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const membership_controller_1 = require("./membership.controller");
const auth_middleware_1 = require("../auth/auth.middleware");
const validation_1 = require("../../shared/middleware/validation");
exports.membershipRoutes = (0, express_1.Router)();
const controller = new membership_controller_1.MembershipController();
// Public: list plans for a location
exports.membershipRoutes.get('/plans', controller.getPlans);
// Customer: own membership
exports.membershipRoutes.get('/my', auth_middleware_1.authenticateUser, controller.getMyMembership);
exports.membershipRoutes.post('/billing-portal', auth_middleware_1.authenticateUser, [
    (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    (0, express_validator_1.body)('returnUrl').isURL({ require_tld: false }).withMessage('returnUrl must be a valid URL'),
    validation_1.handleValidationErrors,
], controller.createBillingPortalSession);
exports.membershipRoutes.post('/subscribe', auth_middleware_1.authenticateUser, [
    (0, express_validator_1.body)('planId').isUUID().withMessage('planId must be a valid UUID'),
    (0, express_validator_1.body)('billingInterval').isIn(['monthly', 'annual']).withMessage('billingInterval must be monthly or annual'),
    validation_1.handleValidationErrors,
], controller.subscribe);
exports.membershipRoutes.post('/:membershipId/change-plan', auth_middleware_1.authenticateUser, [
    (0, express_validator_1.param)('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
    (0, express_validator_1.body)('newPlanId').isUUID().withMessage('newPlanId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.changePlan);
// Employee: plan management
exports.membershipRoutes.post('/plans', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    (0, express_validator_1.body)('name').isString().notEmpty().withMessage('name is required'),
    validation_1.handleValidationErrors,
], controller.createPlan);
exports.membershipRoutes.put('/plans/:planId', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.param)('planId').isUUID().withMessage('planId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.updatePlan);
exports.membershipRoutes.delete('/plans/:planId', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.param)('planId').isUUID().withMessage('planId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.deactivatePlan);
exports.membershipRoutes.get('/subscribers', auth_middleware_1.authenticateEmployee, controller.getSubscribers);
exports.membershipRoutes.post('/manage/:membershipId/cancel', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.param)('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.employeeCancelMembership);
exports.membershipRoutes.post('/manage/:membershipId/change-plan', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.param)('membershipId').isUUID().withMessage('membershipId must be a valid UUID'),
    (0, express_validator_1.body)('newPlanId').isUUID().withMessage('newPlanId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.employeeChangePlan);
// Employee: location membership settings
exports.membershipRoutes.get('/settings/:locationId', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.param)('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.getLocationSettings);
exports.membershipRoutes.put('/settings/:locationId', auth_middleware_1.authenticateEmployee, [
    (0, express_validator_1.param)('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    validation_1.handleValidationErrors,
], controller.updateLocationSettings);
