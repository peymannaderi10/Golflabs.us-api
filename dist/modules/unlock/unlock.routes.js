"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlockRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const unlock_controller_1 = require("./unlock.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
const unlockRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5,
    standardHeaders: true,
    message: { error: 'Too many unlock attempts. Please try again later.' },
});
const unlockRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const unlockController = new unlock_controller_1.UnlockController(socketService);
    // Customer unlock via token
    router.post('/unlock', unlockRateLimit, (0, express_validator_1.query)('token').isString().notEmpty().withMessage('token is required'), validation_1.handleValidationErrors, unlockController.unlockDoor);
    // Employee unlock - tries first available bay
    router.post('/employee-unlock', auth_1.authenticateEmployee, (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.enforceLocationScope, unlockController.employeeUnlock);
    return router;
};
exports.unlockRoutes = unlockRoutes;
