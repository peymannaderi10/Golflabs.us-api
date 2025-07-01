import { Router } from 'express';
import { SocketService } from '../sockets/socket.service';
import { UnlockController } from './unlock.controller';

export const unlockRoutes = (socketService: SocketService) => {
  const router = Router();
  const unlockController = new UnlockController(socketService);

  router.post('/unlock', unlockController.unlockDoor);

  return router;
}; 