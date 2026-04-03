import { Request, Response } from 'express';
import { LogService } from './log.service';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';

export class LogController {
  private logService: LogService;

  constructor() {
    this.logService = new LogService();
  }

  logAccess = async (req: Request, res: Response) => {
    try {
      const logData = {
        ...req.body,
        ip_address: req.ip,
      };

      const newLog = await this.logService.createAccessLog(logData);

      res.status(201).json(newLog);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in logAccess controller');
      res.status(500).json({ error: 'Failed to log access event' });
    }
  };

  getAccessLogs = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const action = req.query.action as string;
      const success = req.query.success !== undefined ? req.query.success === 'true' : undefined;

      if (!locationId) {
        return res.status(400).json({ error: 'Location ID is required' });
      }

      const result = await this.logService.getAccessLogs(locationId as string, {
        page,
        pageSize,
        startDate,
        endDate,
        action,
        success
      });

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in getAccessLogs controller');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
} 