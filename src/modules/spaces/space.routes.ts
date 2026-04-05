import { Router } from 'express';
import { SpaceController } from './space.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateKiosk, validateLocationAccess } from '../auth';

export const createSpaceRoutes = (socketService: SocketService): Router => {
  const spaceRoutes = Router();
  const controller = new SpaceController(socketService);

  spaceRoutes.get('/', controller.getSpaces);
  spaceRoutes.get('/closures/active', controller.getActiveClosures); // Public: customer-facing slot availability
  spaceRoutes.post('/', authenticateEmployee, validateLocationAccess('body'), controller.createSpace);
  spaceRoutes.delete('/:spaceId', authenticateEmployee, controller.deleteSpace);
  spaceRoutes.post('/:spaceId/heartbeat', authenticateKiosk, controller.updateHeartbeat);

  // Employee-only: update space status
  spaceRoutes.put('/:spaceId/status', authenticateEmployee, controller.updateSpaceStatus);

  // Employee-only: space closures
  spaceRoutes.get('/closures', authenticateEmployee, controller.getClosures);
  spaceRoutes.get('/:spaceId/closures', authenticateEmployee, controller.getClosures);
  spaceRoutes.post('/:spaceId/closures', authenticateEmployee, controller.createClosure);
  spaceRoutes.delete('/closures/:closureId', authenticateEmployee, controller.deleteClosure);

  // Employee-only: league mode controls
  spaceRoutes.put('/league-mode/activate', authenticateEmployee, validateLocationAccess('body'), controller.activateLeagueMode);
  spaceRoutes.put('/league-mode/deactivate', authenticateEmployee, validateLocationAccess('body'), controller.deactivateLeagueMode);
  spaceRoutes.put('/:spaceId/league-mode', authenticateEmployee, controller.toggleSpaceLeagueMode);

  return spaceRoutes;
};
