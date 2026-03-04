import { Router } from 'express';
import { UserController } from './user.controller';
import { authenticateUser } from '../auth';

export const userRoutes = Router();

const controller = new UserController();

// User management routes
userRoutes.get('/users/:userId/profile', authenticateUser, controller.getUserProfile);
userRoutes.delete('/users/:userId/account', authenticateUser, controller.deleteAccount);
