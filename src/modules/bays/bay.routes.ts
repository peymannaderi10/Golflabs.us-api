import { Router } from 'express';
import { BayController } from './bay.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateKiosk } from '../auth';

export const createBayRoutes = (socketService: SocketService): Router => {
  const bayRoutes = Router();
  const controller = new BayController(socketService);

  bayRoutes.get('/', controller.getBays);
  bayRoutes.post('/', authenticateEmployee, controller.createBay);
  bayRoutes.delete('/:bayId', authenticateEmployee, controller.deleteBay);
  bayRoutes.post('/:bayId/heartbeat', authenticateKiosk, controller.updateHeartbeat);

  // Employee-only: update bay status
  bayRoutes.put('/:bayId/status', authenticateEmployee, controller.updateBayStatus);

  // Employee-only: league mode controls
  bayRoutes.put('/league-mode/activate', authenticateEmployee, controller.activateLeagueMode);
  bayRoutes.put('/league-mode/deactivate', authenticateEmployee, controller.deactivateLeagueMode);
  bayRoutes.put('/:bayId/league-mode', authenticateEmployee, controller.toggleBayLeagueMode);

  return bayRoutes;
};