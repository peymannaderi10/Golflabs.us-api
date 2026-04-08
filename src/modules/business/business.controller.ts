import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { BusinessService, BusinessSignupError } from './business.service';
import {
  startSignupSchema,
  verifySignupSchema,
  additionalLocationInputSchema,
} from './business.types';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { logger } from '../../shared/utils/logger';

function handleError(error: unknown, res: Response, context: string): Response {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: error.issues[0]?.message || 'Invalid input',
    });
  }
  if (error instanceof BusinessSignupError) {
    return res.status(error.statusCode).json({ success: false, error: error.message });
  }
  logger.error({ err: error, context }, 'Unexpected error in business controller');
  return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
}

export class BusinessController {
  private service: BusinessService;

  constructor() {
    this.service = new BusinessService();
  }

  startSignup = async (req: Request, res: Response) => {
    try {
      const parsed = startSignupSchema.parse(req.body);
      const result = await this.service.startSignup(parsed);
      res.status(202).json({ success: true, data: result });
    } catch (error) {
      handleError(error, res, 'business.startSignup');
    }
  };

  verifySignup = async (req: Request, res: Response) => {
    try {
      const parsed = verifySignupSchema.parse(req.body);
      const result = await this.service.verifySignup(parsed);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      handleError(error, res, 'business.verifySignup');
    }
  };

  createLocation = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employee = req.employeeProfile;
      if (!employee?.clientId || !employee.id) {
        return res.status(403).json({ success: false, error: 'Not associated with a business' });
      }
      if (employee.clientRole !== 'owner' && employee.clientRole !== 'admin') {
        return res
          .status(403)
          .json({ success: false, error: 'Only owners or admins can create locations' });
      }

      const parsed = additionalLocationInputSchema.parse(req.body);
      const result = await this.service.createLocation(
        employee.clientId,
        employee.id,
        employee.clientRole,
        parsed
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      handleError(error, res, 'business.createLocation');
    }
  };
}
