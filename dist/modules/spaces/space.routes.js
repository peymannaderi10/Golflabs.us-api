"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSpaceRoutes = void 0;
const express_1 = require("express");
const space_controller_1 = require("./space.controller");
const auth_1 = require("../auth");
const createSpaceRoutes = (socketService) => {
    const spaceRoutes = (0, express_1.Router)();
    const controller = new space_controller_1.SpaceController(socketService);
    spaceRoutes.get('/', controller.getSpaces);
    spaceRoutes.post('/', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), controller.createSpace);
    spaceRoutes.delete('/:spaceId', auth_1.authenticateEmployee, controller.deleteSpace);
    spaceRoutes.post('/:spaceId/heartbeat', auth_1.authenticateKiosk, controller.updateHeartbeat);
    // Employee-only: update space status
    spaceRoutes.put('/:spaceId/status', auth_1.authenticateEmployee, controller.updateSpaceStatus);
    // Employee-only: league mode controls
    spaceRoutes.put('/league-mode/activate', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), controller.activateLeagueMode);
    spaceRoutes.put('/league-mode/deactivate', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), controller.deactivateLeagueMode);
    spaceRoutes.put('/:spaceId/league-mode', auth_1.authenticateEmployee, controller.toggleSpaceLeagueMode);
    return spaceRoutes;
};
exports.createSpaceRoutes = createSpaceRoutes;
