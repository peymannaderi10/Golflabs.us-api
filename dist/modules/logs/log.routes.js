"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRoutes = void 0;
const express_1 = require("express");
const log_controller_1 = require("./log.controller");
const auth_1 = require("../auth");
const express_validator_1 = require("express-validator");
const validation_1 = require("../../shared/middleware/validation");
exports.logRoutes = (0, express_1.Router)();
const controller = new log_controller_1.LogController();
exports.logRoutes.post('/access', auth_1.authenticateKioskOrEmployee, [
    (0, express_validator_1.body)('bay_id').isUUID().withMessage('bay_id must be a valid UUID'),
    (0, express_validator_1.body)('action').isIn([
        'session_started',
        'session_ended',
        'door_unlock_button_pressed',
        'door_unlock_success',
        'door_unlock_failure',
        'booking_reserved',
        'employee_door_unlock',
        'extension_offered',
        'extension_payment_failed',
        'extension_declined',
    ]).withMessage('action must be a valid action type'),
    (0, express_validator_1.body)('success').isBoolean().withMessage('success must be a boolean'),
    validation_1.handleValidationErrors,
], controller.logAccess);
