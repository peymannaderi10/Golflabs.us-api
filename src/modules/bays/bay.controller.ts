import { Request, Response } from 'express';
import { BayService } from './bay.service';

export class BayController {
  private bayService: BayService;

  constructor() {
    this.bayService = new BayService();
  }

  getBays = async (req: Request, res: Response) => {
    try {
      const locationId = req.query.locationId as string;
      const bays = await this.bayService.getBaysByLocationId(locationId);
      res.status(200).json(bays);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };

  updateHeartbeat = async (req: Request, res: Response) => {
    try {
      const { bayId } = req.params;
      const kioskIp = req.ip;

      const updatedBay = await this.bayService.updateBayHeartbeat(bayId, kioskIp);

      res.status(200).json(updatedBay);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };
} 