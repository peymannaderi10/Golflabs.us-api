"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKioskRoutes = void 0;
const express_1 = require("express");
const kiosk_controller_1 = require("./kiosk.controller");
const kiosk_service_1 = require("./kiosk.service");
const auth_1 = require("../auth");
/**
 * Two route families:
 *
 *  1. Kiosk-authenticated (`X-Kiosk-Key` header via `authenticateKiosk`).
 *     Used by the kiosk binary itself during self-registration and on
 *     every boot. The bootstrap key is a binary identity, not a
 *     per-customer credential — same risk model as today's kiosk auth.
 *
 *  2. Employee-authenticated (`authenticateEmployee` + `enforceLocationScope`).
 *     Used by the Manage Spaces view in the dashboard. Every mutation
 *     additionally requires owner/admin role since kiosk config is
 *     operational infrastructure, not day-to-day staff work.
 */
const createKioskRoutes = (socketService) => {
    const router = (0, express_1.Router)();
    const service = new kiosk_service_1.KioskService(socketService);
    const controller = new kiosk_controller_1.KioskController(service);
    // --- Kiosk-authenticated ---
    router.get('/locations/:locationId/spaces', auth_1.authenticateKiosk, controller.listUnclaimedSpaces);
    router.post('/register', auth_1.authenticateKiosk, controller.register);
    router.get('/settings/:installationId', auth_1.authenticateKiosk, controller.getSettingsByInstallation);
    // --- Employee-authenticated ---
    // Resource-param routes resolve the owning locationId from `spaces`
    // before `enforceLocationScope` runs, so a cross-tenant spaceId
    // returns 404 instead of 403 (no enumeration oracle).
    const scopeSpace = (0, auth_1.resolveResourceLocation)('spaces', 'spaceId');
    router.get('/by-space/:spaceId', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.getSettingsBySpace);
    router.patch('/by-space/:spaceId', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.updateSettings);
    router.post('/by-space/:spaceId/restart', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.restart);
    router.post('/by-space/:spaceId/clear-installation', auth_1.authenticateEmployee, scopeSpace, auth_1.enforceLocationScope, controller.clearInstallation);
    return router;
};
exports.createKioskRoutes = createKioskRoutes;
