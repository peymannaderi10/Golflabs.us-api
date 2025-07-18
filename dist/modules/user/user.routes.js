"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const express_1 = require("express");
const user_controller_1 = require("./user.controller");
exports.userRoutes = (0, express_1.Router)();
const controller = new user_controller_1.UserController();
// User management routes
exports.userRoutes.get('/users/:userId/profile', controller.getUserProfile);
exports.userRoutes.delete('/users/:userId/account', controller.deleteAccount);
