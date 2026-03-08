"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const user_controller_1 = require("./user.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
exports.userRoutes = (0, express_1.Router)();
const controller = new user_controller_1.UserController();
// User management routes
exports.userRoutes.get('/users/:userId/profile', (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.authenticateUser, controller.getUserProfile);
exports.userRoutes.delete('/users/:userId/account', (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'), validation_1.handleValidationErrors, auth_1.authenticateUser, controller.deleteAccount);
