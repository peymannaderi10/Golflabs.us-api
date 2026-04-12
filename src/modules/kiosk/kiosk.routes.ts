import { Router } from 'express';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { SocketService } from '../sockets/socket.service';
import {
  authenticateEmployee,
  authenticateKiosk,
  enforceLocationScope,
  resolveResourceLocation,
} from '../auth';

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
export const createKioskRoutes = (socketService: SocketService): Router => {
  const router = Router();
  const service = new KioskService(socketService);
  const controller = new KioskController(service);

  // --- Kiosk-authenticated ---
  router.get(
    '/locations/:locationId/spaces',
    authenticateKiosk,
    controller.listUnclaimedSpaces
  );
  router.post('/register', authenticateKiosk, controller.register);
  router.get(
    '/settings/:installationId',
    authenticateKiosk,
    controller.getSettingsByInstallation
  );

  // --- Employee-authenticated ---
  // Resource-param routes resolve the owning locationId from `spaces`
  // before `enforceLocationScope` runs, so a cross-tenant spaceId
  // returns 404 instead of 403 (no enumeration oracle).
  const scopeSpace = resolveResourceLocation('spaces', 'spaceId');

  router.get(
    '/by-space/:spaceId',
    authenticateEmployee,
    scopeSpace,
    enforceLocationScope,
    controller.getSettingsBySpace
  );
  router.patch(
    '/by-space/:spaceId',
    authenticateEmployee,
    scopeSpace,
    enforceLocationScope,
    controller.updateSettings
  );
  router.post(
    '/by-space/:spaceId/restart',
    authenticateEmployee,
    scopeSpace,
    enforceLocationScope,
    controller.restart
  );
  router.post(
    '/by-space/:spaceId/clear-installation',
    authenticateEmployee,
    scopeSpace,
    enforceLocationScope,
    controller.clearInstallation
  );

  return router;
};
