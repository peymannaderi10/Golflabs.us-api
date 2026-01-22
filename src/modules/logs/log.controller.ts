import { Request, Response } from 'express';
import { LogService } from './log.service';

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
      console.error('Error in logAccess controller:', error.message);
      res.status(500).json({ message: 'Failed to log access event', error: error.message });
    }
  };

  getAccessLogs = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
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
      console.error('Error in getAccessLogs controller:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch access logs' });
    }
  };
} 