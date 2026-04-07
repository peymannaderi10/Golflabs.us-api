"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSpaceRoutes = void 0;
const express_1 = require("express");
const space_controller_1 = require("./space.controller");
const auth_1 = require("../auth");
const createSpaceRoutes = (socketService) => {
    const spaceRoutes = (0, express_1.Router)();
    const controller = new space_controller_1.SpaceController(socketService);
    // Public routes — no auth.
    spaceRoutes.get('/', controller.getSpaces);
    spaceRoutes.get('/closures/active', controller.getActiveClosures);
    // Kiosk-authenticated.
    spaceRoutes.post('/:spaceId/heartbeat', auth_1.authenticateKiosk, controller.updateHeartbeat);
    // Employee-authenticated routes below. Every route is gated by
    // authenticate + enforceLocationScope. Resource-param routes resolve
    // locationId from the spaces table first.
    const scopeSpace = (0, auth_1.resolveResourceLocation)('spaces', 'spaceId');
    const scopeClosure = (0, auth_1.resolveResourceLocation)('space_closures', 'closureId');
    spaceRoutes.post('/', auth_1.authenticateEmployee, auth_1.enforceLocationScope, controller.createSpace);
    spaceRoutes.delete('/:spaceId', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.deleteSpace);
    spaceRoutes.put('/:spaceId/status', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.updateSpaceStatus);
    // Closures
    spaceRoutes.get('/closures', auth_1.authenticateEmployee, auth_1.enforceLocationScope, controller.getClosures);
    spaceRoutes.get('/:spaceId/closures', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.getClosures);
    spaceRoutes.post('/:spaceId/closures', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.createClosure);
    spaceRoutes.delete('/closures/:closureId', auth_1.authenticateEmployee, scopeClosure, auth_1.enforceLocationScope, controller.deleteClosure);
    // League mode
    spaceRoutes.put('/league-mode/activate', auth_1.authenticateEmployee, auth_1.enforceLocationScope, controller.activateLeagueMode);
    spaceRoutes.put('/league-mode/deactivate', auth_1.authenticateEmployee, auth_1.enforceLocationScope, controller.deactivateLeagueMode);
    spaceRoutes.put('/:spaceId/league-mode', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.toggleSpaceLeagueMode);
    return spaceRoutes;
};
exports.createSpaceRoutes = createSpaceRoutes;
