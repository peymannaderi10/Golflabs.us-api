"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bayRoutes = void 0;
const express_1 = require("express");
const bay_controller_1 = require("./bay.controller");
const employee_middleware_1 = require("../bookings/employee.middleware");
exports.bayRoutes = (0, express_1.Router)();
const controller = new bay_controller_1.BayController();
// Bay routes
exports.bayRoutes.get('/', controller.getBays);
exports.bayRoutes.post('/:bayId/heartbeat', controller.updateHeartbeat);
// Employee-only: update bay status
exports.bayRoutes.put('/:bayId/status', employee_middleware_1.authenticateEmployee, controller.updateBayStatus);
