import { Router } from 'express';
import { BayController } from './bay.controller';

export const bayRoutes = Router();

const controller = new BayController();

// Bay routes
bayRoutes.get('/', controller.getBays);
bayRoutes.post('/:bayId/heartbeat', controller.updateHeartbeat); 