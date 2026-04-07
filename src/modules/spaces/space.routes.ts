import { Router } from 'express';
import { SpaceController } from './space.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateKiosk, enforceLocationScope, resolveResourceLocation } from '../auth';

export const createSpaceRoutes = (socketService: SocketService): Router => {
  const spaceRoutes = Router();
  const controller = new SpaceController(socketService);

  // Public routes — no auth.
  spaceRoutes.get('/', controller.getSpaces);
  spaceRoutes.get('/closures/active', controller.getActiveClosures);

  // Kiosk-authenticated.
  spaceRoutes.post('/:spaceId/heartbeat', authenticateKiosk, controller.updateHeartbeat);

  // Employee-authenticated routes below. Every route is gated by
  // authenticate + enforceLocationScope. Resource-param routes resolve
  // locationId from the spaces table first.
  const scopeSpace = resolveResourceLocation('spaces', 'spaceId');
  const scopeClosure = resolveResourceLocation('space_closures', 'closureId');

  spaceRoutes.post('/', authenticateEmployee, enforceLocationScope, controller.createSpace);

  spaceRoutes.delete('/:spaceId', authenticateEmployee, scopeSpace, enforceLocationScope, controller.deleteSpace);
  spaceRoutes.put('/:spaceId/status', authenticateEmployee, scopeSpace, enforceLocationScope, controller.updateSpaceStatus);

  // Closures
  spaceRoutes.get('/closures', authenticateEmployee, enforceLocationScope, controller.getClosures);
  spaceRoutes.get('/:spaceId/closures', authenticateEmployee, scopeSpace, enforceLocationScope, controller.getClosures);
  spaceRoutes.post('/:spaceId/closures', authenticateEmployee, scopeSpace, enforceLocationScope, controller.createClosure);
  spaceRoutes.delete('/closures/:closureId', authenticateEmployee, scopeClosure, enforceLocationScope, controller.deleteClosure);

  // League mode
  spaceRoutes.put('/league-mode/activate', authenticateEmployee, enforceLocationScope, controller.activateLeagueMode);
  spaceRoutes.put('/league-mode/deactivate', authenticateEmployee, enforceLocationScope, controller.deactivateLeagueMode);
  spaceRoutes.put('/:spaceId/league-mode', authenticateEmployee, scopeSpace, enforceLocationScope, controller.toggleSpaceLeagueMode);

  return spaceRoutes;
};
