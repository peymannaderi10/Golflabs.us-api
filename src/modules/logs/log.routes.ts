import { Router } from 'express';
import { LogController } from './log.controller';
import { authenticateKioskOrEmployee } from '../auth';
import { body } from 'express-validator';
import { handleValidationErrors } from '../../shared/middleware/validation';

export const logRoutes = Router();

const controller = new LogController();

logRoutes.post('/access', authenticateKioskOrEmployee, [
  body('space_id').isUUID().withMessage('space_id must be a valid UUID'),
  body('action').isIn([
    'session_started',
    'session_ended',
    'door_unlock_button_pressed',
    'door_unlock_success',
    'door_unlock_failure',
    'booking_reserved',
    'employee_door_unlock',
    'extension_offered',
    'extension_payment_failed',
    'extension_declined',
  ]).withMessage('action must be a valid action type'),
  body('success').isBoolean().withMessage('success must be a boolean'),
  handleValidationErrors,
], controller.logAccess); 