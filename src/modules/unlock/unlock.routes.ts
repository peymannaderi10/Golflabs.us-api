import { Router } from 'express';
import { SocketService } from '../sockets/socket.service';
import { UnlockController } from './unlock.controller';
import { authenticateEmployee } from '../bookings/employee.middleware';

export const unlockRoutes = (socketService: SocketService) => {
  const router = Router();
  const unlockController = new UnlockController(socketService);

  // Customer unlock via token
  router.post('/unlock', unlockController.unlockDoor);
  
  // Employee unlock - tries first available bay
  router.post('/employee-unlock', authenticateEmployee, unlockController.employeeUnlock);

  return router;
}; 