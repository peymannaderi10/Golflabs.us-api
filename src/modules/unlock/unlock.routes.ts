import { Router } from 'express';
import { body, query } from 'express-validator';
import { SocketService } from '../sockets/socket.service';
import { UnlockController } from './unlock.controller';
import { authenticateEmployee, validateLocationAccess } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

export const unlockRoutes = (socketService: SocketService) => {
  const router = Router();
  const unlockController = new UnlockController(socketService);

  // Customer unlock via token
  router.post('/unlock',
    query('token').isString().notEmpty().withMessage('token is required'),
    handleValidationErrors,
    unlockController.unlockDoor,
  );
  
  // Employee unlock - tries first available bay
  router.post('/employee-unlock',
    authenticateEmployee,
    body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    handleValidationErrors,
    validateLocationAccess('body'),
    unlockController.employeeUnlock,
  );

  return router;
}; 