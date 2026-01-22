import { Router } from 'express';
import { LogController } from './log.controller';
import { authenticateEmployee } from '../bookings/employee.middleware';

export const logRoutes = Router();

const controller = new LogController();

// Log routes
logRoutes.post('/access', controller.logAccess); 