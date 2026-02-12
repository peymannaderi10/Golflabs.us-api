import { Router } from 'express';
import { BayController } from './bay.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee } from '../bookings/employee.middleware';

export const createBayRoutes = (socketService: SocketService): Router => {
  const bayRoutes = Router();
  const controller = new BayController(socketService);

  // Bay routes
  bayRoutes.get('/', controller.getBays); 
  bayRoutes.post('/:bayId/heartbeat', controller.updateHeartbeat);

  // Employee-only: update bay status
  bayRoutes.put('/:bayId/status', authenticateEmployee, controller.updateBayStatus);

  // Employee-only: league mode controls
  bayRoutes.put('/league-mode/activate', authenticateEmployee, controller.activateLeagueMode);
  bayRoutes.put('/league-mode/deactivate', authenticateEmployee, controller.deactivateLeagueMode);
  bayRoutes.put('/:bayId/league-mode', authenticateEmployee, controller.toggleBayLeagueMode);

  return bayRoutes;
};