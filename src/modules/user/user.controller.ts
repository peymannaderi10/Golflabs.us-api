import { Response } from 'express';
import { UserService } from './user.service';
import { AuthenticatedRequest } from '../auth';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  deleteAccount = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      if (req.user?.id !== userId) {
        return res.status(403).json({ error: 'You can only delete your own account' });
      }

      const result = await this.userService.deleteAccount(userId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in deleteAccount endpoint');
      
      if (error.message === 'User not found') {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message === 'User ID is required') {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'An unexpected error occurred while deleting account' });
    }
  };

  exportUserData = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      if (req.user?.id !== userId) {
        return res.status(403).json({ error: 'You can only export your own data' });
      }

      const data = await this.userService.exportUserData(userId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      if (req.user?.id !== userId) {
        return res.status(403).json({ error: 'You can only view your own profile' });
      }

      const profile = await this.userService.getUserProfile(userId);
      res.json(profile);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in getUserProfile endpoint');
      
      if (error.message === 'User ID is required') {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'An unexpected error occurred while fetching user profile' });
    }
  };
} 