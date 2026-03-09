import { Router } from 'express';
import { param } from 'express-validator';
import { UserController } from './user.controller';
import { authenticateUser } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';
import { SocketService } from '../sockets/socket.service';

export function createUserRoutes(socketService: SocketService) {
  const router = Router();
  const controller = new UserController(socketService);

  router.get('/users/:userId/profile',
    param('userId').isUUID().withMessage('userId must be a valid UUID'),
    handleValidationErrors,
    authenticateUser,
    controller.getUserProfile,
  );
  router.get('/users/:userId/export',
    param('userId').isUUID().withMessage('userId must be a valid UUID'),
    handleValidationErrors,
    authenticateUser,
    controller.exportUserData,
  );
  router.delete('/users/:userId/account',
    param('userId').isUUID().withMessage('userId must be a valid UUID'),
    handleValidationErrors,
    authenticateUser,
    controller.deleteAccount,
  );

  return router;
}
