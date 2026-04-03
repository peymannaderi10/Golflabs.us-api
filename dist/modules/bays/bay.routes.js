"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBayRoutes = void 0;
const express_1 = require("express");
const bay_controller_1 = require("./bay.controller");
const auth_1 = require("../auth");
const createBayRoutes = (socketService) => {
    const bayRoutes = (0, express_1.Router)();
    const controller = new bay_controller_1.BayController(socketService);
    bayRoutes.get('/', controller.getBays);
    bayRoutes.post('/', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), controller.createBay);
    bayRoutes.delete('/:bayId', auth_1.authenticateEmployee, controller.deleteBay);
    bayRoutes.post('/:bayId/heartbeat', auth_1.authenticateKiosk, controller.updateHeartbeat);
    // Employee-only: update bay status
    bayRoutes.put('/:bayId/status', auth_1.authenticateEmployee, controller.updateBayStatus);
    // Employee-only: league mode controls
    bayRoutes.put('/league-mode/activate', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), controller.activateLeagueMode);
    bayRoutes.put('/league-mode/deactivate', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), controller.deactivateLeagueMode);
    bayRoutes.put('/:bayId/league-mode', auth_1.authenticateEmployee, controller.toggleBayLeagueMode);
    return bayRoutes;
};
exports.createBayRoutes = createBayRoutes;
