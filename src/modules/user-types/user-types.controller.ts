import { Request, Response } from 'express';
import { userTypesService } from './user-types.service';
import { logger } from '../../shared/utils/logger';

export class UserTypesController {
  getByLocation = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }
      const types = await userTypesService.getByLocation(locationId as string);
      res.json(types);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in getByLocation user-types');
      res.status(500).json({ error: error.message || 'An unexpected error occurred' });
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }
      const { slug, label, isDefault } = req.body;
      if (!slug || !label) {
        return res.status(400).json({ error: 'slug and label are required' });
      }
      const userType = await userTypesService.create(locationId, { slug, label, isDefault });
      res.status(201).json(userType);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in create user-type');
      const status = error.message.includes('already exists') ? 409 : 500;
      res.status(status).json({ error: error.message || 'An unexpected error occurred' });
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }
      const { slug, label, isDefault } = req.body;
      const userType = await userTypesService.update(id, { slug, label, isDefault });
      res.json(userType);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in update user-type');
      const status = error.message.includes('not found') ? 404
        : error.message.includes('already exists') ? 409
        : 500;
      res.status(status).json({ error: error.message || 'An unexpected error occurred' });
    }
  };

  delete = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }
      await userTypesService.delete(id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error in delete user-type');
      const status = error.message.includes('Cannot delete') ? 400
        : error.message.includes('not found') ? 404
        : 500;
      res.status(status).json({ error: error.message || 'An unexpected error occurred' });
    }
  };
}

export const userTypesController = new UserTypesController();
