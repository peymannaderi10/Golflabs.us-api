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
} 