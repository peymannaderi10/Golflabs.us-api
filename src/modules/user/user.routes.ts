import { Router } from 'express';
import { UserController } from './user.controller';

export const userRoutes = Router();

const controller = new UserController();

// User management routes
userRoutes.get('/users/:userId/profile', controller.getUserProfile);
userRoutes.delete('/users/:userId/account', controller.deleteAccount); 