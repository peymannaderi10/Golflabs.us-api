import { Router } from 'express';
import { BayController } from './bay.controller';
import { authenticateEmployee } from '../bookings/employee.middleware';

export const bayRoutes = Router();

const controller = new BayController();

// Bay routes
bayRoutes.get('/', controller.getBays); 
bayRoutes.post('/:bayId/heartbeat', controller.updateHeartbeat);

// Employee-only: update bay status
bayRoutes.put('/:bayId/status', authenticateEmployee, controller.updateBayStatus); 