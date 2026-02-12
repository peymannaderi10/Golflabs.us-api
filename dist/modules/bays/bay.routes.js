"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBayRoutes = void 0;
const express_1 = require("express");
const bay_controller_1 = require("./bay.controller");
const employee_middleware_1 = require("../bookings/employee.middleware");
const createBayRoutes = (socketService) => {
    const bayRoutes = (0, express_1.Router)();
    const controller = new bay_controller_1.BayController(socketService);
    // Bay routes
    bayRoutes.get('/', controller.getBays);
    bayRoutes.post('/:bayId/heartbeat', controller.updateHeartbeat);
    // Employee-only: update bay status
    bayRoutes.put('/:bayId/status', employee_middleware_1.authenticateEmployee, controller.updateBayStatus);
    // Employee-only: league mode controls
    bayRoutes.put('/league-mode/activate', employee_middleware_1.authenticateEmployee, controller.activateLeagueMode);
    bayRoutes.put('/league-mode/deactivate', employee_middleware_1.authenticateEmployee, controller.deactivateLeagueMode);
    bayRoutes.put('/:bayId/league-mode', employee_middleware_1.authenticateEmployee, controller.toggleBayLeagueMode);
    return bayRoutes;
};
exports.createBayRoutes = createBayRoutes;
