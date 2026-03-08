import { Router } from 'express';
import { param } from 'express-validator';
import { UserController } from './user.controller';
import { authenticateUser } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

export const userRoutes = Router();

const controller = new UserController();

// User management routes
userRoutes.get('/users/:userId/profile',
  param('userId').isUUID().withMessage('userId must be a valid UUID'),
  handleValidationErrors,
  authenticateUser,
  controller.getUserProfile,
);
userRoutes.delete('/users/:userId/account',
  param('userId').isUUID().withMessage('userId must be a valid UUID'),
  handleValidationErrors,
  authenticateUser,
  controller.deleteAccount,
);
