import { Router } from 'express';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { SocketService } from '../sockets/socket.service';
import { UnlockController } from './unlock.controller';
import { authenticateEmployee, enforceLocationScope } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

const unlockRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  standardHeaders: true,
  message: { error: 'Too many unlock attempts. Please try again later.' },
});

export const unlockRoutes = (socketService: SocketService) => {
  const router = Router();
  const unlockController = new UnlockController(socketService);

  // Customer unlock via token
  router.post('/unlock',
    unlockRateLimit,
    query('token').isString().notEmpty().withMessage('token is required'),
    handleValidationErrors,
    unlockController.unlockDoor,
  );
  
  // Employee unlock - tries first available bay
  router.post('/employee-unlock',
    authenticateEmployee,
    body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    handleValidationErrors,
    enforceLocationScope,
    unlockController.employeeUnlock,
  );

  return router;
}; 