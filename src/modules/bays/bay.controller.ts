import { Request, Response } from 'express';
import { BayService } from './bay.service';
import { SocketService } from '../sockets/socket.service';

export class BayController {
  private bayService: BayService;
  private socketService: SocketService | null;

  constructor(socketService?: SocketService) {
    this.bayService = new BayService();
    this.socketService = socketService || null;
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

  // Add: Update bay status
  updateBayStatus = async (req: Request, res: Response) => {
    try {
      const { bayId } = req.params;
      const { status } = req.body as { status: 'available' | 'closed' };

      if (!status) {
        return res.status(400).json({ message: 'Status is required' });
      }

      const updatedBay = await this.bayService.updateBayStatus(bayId, status);
      res.status(200).json(updatedBay);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };

  // =====================================================
  // LEAGUE MODE
  // =====================================================

  activateLeagueMode = async (req: Request, res: Response) => {
    try {
      const { locationId, leagueId } = req.body;

      if (!locationId || !leagueId) {
        return res.status(400).json({ message: 'locationId and leagueId are required' });
      }

      const updatedBays = await this.bayService.activateLeagueMode(locationId, leagueId);

      // Broadcast to kiosks
      if (this.socketService) {
        this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
          active: true,
          leagueId,
          locationId,
        });
      }

      res.status(200).json({ message: 'League mode activated', bays: updatedBays });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };

  deactivateLeagueMode = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.body;

      if (!locationId) {
        return res.status(400).json({ message: 'locationId is required' });
      }

      const updatedBays = await this.bayService.deactivateLeagueMode(locationId);

      // Broadcast to kiosks
      if (this.socketService) {
        this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
          active: false,
          leagueId: null,
          locationId,
        });
      }

      res.status(200).json({ message: 'League mode deactivated', bays: updatedBays });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };

  toggleBayLeagueMode = async (req: Request, res: Response) => {
    try {
      const { bayId } = req.params;
      const { active, leagueId } = req.body;

      if (active === undefined) {
        return res.status(400).json({ message: 'active is required' });
      }

      const updatedBay = await this.bayService.toggleBayLeagueMode(bayId, active, leagueId || null);

      // Broadcast to the specific kiosk
      if (this.socketService) {
        this.socketService.broadcastToLocation(updatedBay.location_id, 'league_mode_changed', {
          active,
          leagueId: active ? leagueId : null,
          bayId,
          locationId: updatedBay.location_id,
        });
      }

      res.status(200).json(updatedBay);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };
} 