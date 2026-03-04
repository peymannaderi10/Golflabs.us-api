"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const express_1 = require("express");
const user_controller_1 = require("./user.controller");
const auth_1 = require("../auth");
exports.userRoutes = (0, express_1.Router)();
const controller = new user_controller_1.UserController();
// User management routes
exports.userRoutes.get('/users/:userId/profile', auth_1.authenticateUser, controller.getUserProfile);
exports.userRoutes.delete('/users/:userId/account', auth_1.authenticateUser, controller.deleteAccount);
