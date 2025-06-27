"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRoutes = void 0;
const express_1 = require("express");
const log_controller_1 = require("./log.controller");
exports.logRoutes = (0, express_1.Router)();
const controller = new log_controller_1.LogController();
// Log routes
exports.logRoutes.post('/access', controller.logAccess);
