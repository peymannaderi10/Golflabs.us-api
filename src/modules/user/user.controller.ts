import { Response } from 'express';
import { UserService } from './user.service';
import { AuthenticatedRequest } from '../auth';

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
      console.error('Error in deleteAccount endpoint:', error);
      
      if (error.message === 'User not found') {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message === 'User ID is required') {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'An unexpected error occurred while deleting account' });
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
      console.error('Error in getUserProfile endpoint:', error);
      
      if (error.message === 'User ID is required') {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'An unexpected error occurred while fetching user profile' });
    }
  };
} 