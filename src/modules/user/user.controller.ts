import { Request, Response } from 'express';
import { UserService } from './user.service';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  deleteAccount = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
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

  getUserProfile = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
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