"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserRoutes = createUserRoutes;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const user_controller_1 = require("./user.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
function createUserRoutes(socketService) {
    const router = (0, express_1.Router)();
    const controller = new user_controller_1.UserController(socketService);
    router.get('/users/:userId/profile', (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.authenticateUser, controller.getUserProfile);
    router.get('/users/:userId/export', (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.authenticateUser, controller.exportUserData);
    router.delete('/users/:userId/account', (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.authenticateUser, controller.deleteAccount);
    router.post('/users/:userId/locations', (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'), (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.authenticateUser, controller.associateLocation);
    return router;
}
