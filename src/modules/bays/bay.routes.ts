import { Router } from 'express';
import { BayController } from './bay.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateKiosk, validateLocationAccess } from '../auth';

export const createBayRoutes = (socketService: SocketService): Router => {
  const bayRoutes = Router();
  const controller = new BayController(socketService);

  bayRoutes.get('/', controller.getBays);
  bayRoutes.post('/', authenticateEmployee, validateLocationAccess('body'), controller.createBay);
  bayRoutes.delete('/:bayId', authenticateEmployee, controller.deleteBay);
  bayRoutes.post('/:bayId/heartbeat', authenticateKiosk, controller.updateHeartbeat);

  // Employee-only: update bay status
  bayRoutes.put('/:bayId/status', authenticateEmployee, controller.updateBayStatus);

  // Employee-only: league mode controls
  bayRoutes.put('/league-mode/activate', authenticateEmployee, validateLocationAccess('body'), controller.activateLeagueMode);
  bayRoutes.put('/league-mode/deactivate', authenticateEmployee, validateLocationAccess('body'), controller.deactivateLeagueMode);
  bayRoutes.put('/:bayId/league-mode', authenticateEmployee, controller.toggleBayLeagueMode);

  return bayRoutes;
};