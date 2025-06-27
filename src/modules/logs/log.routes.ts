import { Router } from 'express';
import { LogController } from './log.controller';

export const logRoutes = Router();

const controller = new LogController();

// Log routes
logRoutes.post('/access', controller.logAccess); 