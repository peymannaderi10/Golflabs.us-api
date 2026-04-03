"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlockRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const unlock_controller_1 = require("./unlock.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
const unlockRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const unlockController = new unlock_controller_1.UnlockController(socketService);
    // Customer unlock via token
    router.post('/unlock', (0, express_validator_1.query)('token').isString().notEmpty().withMessage('token is required'), validation_1.handleValidationErrors, unlockController.unlockDoor);
    // Employee unlock - tries first available bay
    router.post('/employee-unlock', auth_1.authenticateEmployee, (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'), validation_1.handleValidationErrors, (0, auth_1.validateLocationAccess)('body'), unlockController.employeeUnlock);
    return router;
};
exports.unlockRoutes = unlockRoutes;
