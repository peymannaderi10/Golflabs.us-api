import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { SpaceService } from './space.service';
import { SocketService } from '../sockets/socket.service';
import { sanitizeError } from '../../shared/utils/error.utils';

export class SpaceController {
  private spaceService: SpaceService;
  private socketService: SocketService | null;

  constructor(socketService?: SocketService) {
    this.spaceService = new SpaceService();
    this.socketService = socketService || null;
  }

  getSpaces = async (req: Request, res: Response) => {
    try {
      const locationId = req.query.locationId as string;
      const spaces = await this.spaceService.getSpacesByLocationId(locationId);
      res.status(200).json(spaces);
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  createSpace = async (req: Request, res: Response) => {
    try {
      const { locationId, name, spaceNumber, equipment, kioskEquipped } = req.body;

      if (!locationId || !name || spaceNumber === undefined) {
        return res.status(400).json({ message: 'locationId, name, and spaceNumber are required' });
      }

      const space = await this.spaceService.createSpace(
        locationId,
        name,
        spaceNumber,
        equipment,
        kioskEquipped === true,
      );

      // Broadcast to dashboards
      if (this.socketService) {
        this.socketService.broadcastSpaceCreated(locationId, space);
      }

      res.status(201).json(space);
    } catch (error: any) {
      const status = typeof error?.statusCode === 'number' ? error.statusCode : 500;
      res.status(status).json({ error: sanitizeError(error), message: error?.message });
    }
  };

  deleteSpace = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { spaceId } = req.params;

      if (!spaceId) {
        return res.status(400).json({ message: 'spaceId is required' });
      }

      const spaceLocationId = await this.spaceService.getSpaceLocationId(spaceId);
      if (!spaceLocationId) return res.status(404).json({ message: 'Space not found' });
      if (!req.employeeProfile?.accessibleLocationIds?.includes(spaceLocationId)) {
        return res.status(403).json({ message: 'Access denied: space belongs to a different location' });
      }

      const result = await this.spaceService.deleteSpace(spaceId);

      // Broadcast to dashboards
      if (this.socketService && result.locationId) {
        this.socketService.broadcastSpaceDeleted(result.locationId, spaceId);
      }

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  updateHeartbeat = async (req: Request, res: Response) => {
    try {
      const { spaceId } = req.params;
      const kioskIp = req.ip;

      const updatedSpace = await this.spaceService.updateSpaceHeartbeat(spaceId, kioskIp);

      // Broadcast heartbeat to dashboards so they can update online status
      if (this.socketService && updatedSpace.location_id) {
        this.socketService.broadcastSpaceUpdate(updatedSpace.location_id, updatedSpace);
      }

      res.status(200).json(updatedSpace);
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // Add: Update space status
  updateSpaceStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { spaceId } = req.params;
      const { status } = req.body as { status: 'available' | 'closed' };

      if (!status) {
        return res.status(400).json({ message: 'Status is required' });
      }

      const spaceLocationId = await this.spaceService.getSpaceLocationId(spaceId);
      if (!spaceLocationId) return res.status(404).json({ message: 'Space not found' });
      if (!req.employeeProfile?.accessibleLocationIds?.includes(spaceLocationId)) {
        return res.status(403).json({ message: 'Access denied: space belongs to a different location' });
      }

      const updatedSpace = await this.spaceService.updateSpaceStatus(spaceId, status);

      // Broadcast to dashboards
      if (this.socketService && updatedSpace.location_id) {
        this.socketService.broadcastSpaceUpdate(updatedSpace.location_id, updatedSpace);
      }

      res.status(200).json(updatedSpace);
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // SPACE CLOSURES
  // =====================================================

  // Public endpoint — no auth, returns closures for a location (used by customer booking grid)
  getActiveClosures = async (req: Request, res: Response) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }
      const closures = await this.spaceService.getClosuresByLocation(locationId);
      res.json({ success: true, data: closures });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // Employee endpoint — location-scoped
  getClosures = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { spaceId } = req.params;
      const locationId = req.query.locationId as string;

      if (spaceId) {
        const spaceLocationId = await this.spaceService.getSpaceLocationId(spaceId);
        if (!spaceLocationId) return res.status(404).json({ error: 'Space not found' });
        if (!req.employeeProfile?.accessibleLocationIds?.includes(spaceLocationId)) {
          return res.status(403).json({ error: 'Access denied: space belongs to a different location' });
        }
        const closures = await this.spaceService.getClosures(spaceId);
        return res.json({ success: true, data: closures });
      }
      if (locationId) {
        if (!req.employeeProfile?.accessibleLocationIds?.includes(locationId)) {
          return res.status(403).json({ error: 'Access denied: location mismatch' });
        }
        const closures = await this.spaceService.getClosuresByLocation(locationId);
        return res.json({ success: true, data: closures });
      }
      res.status(400).json({ error: 'spaceId or locationId is required' });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  createClosure = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { spaceId } = req.params;
      const { closureType, dates, recurringDays, startDate, endDate, startTime, endTime, reason } = req.body;

      if (!spaceId || !closureType) {
        return res.status(400).json({ error: 'spaceId and closureType are required' });
      }

      const VALID_CLOSURE_TYPES = ['indefinite', 'dates', 'recurring', 'range', 'hours'];
      if (!VALID_CLOSURE_TYPES.includes(closureType)) {
        return res.status(400).json({ error: 'closureType must be one of: indefinite, dates, recurring, range, hours' });
      }

      const spaceLocationId = await this.spaceService.getSpaceLocationId(spaceId);
      if (!spaceLocationId) return res.status(404).json({ error: 'Space not found' });
      if (!req.employeeProfile?.accessibleLocationIds?.includes(spaceLocationId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const closure = await this.spaceService.createClosure({
        spaceId,
        locationId: spaceLocationId,
        closureType,
        dates,
        recurringDays,
        startDate,
        endDate,
        startTime,
        endTime,
        reason,
        createdBy: req.user?.id || '',
      });

      // Broadcast update
      if (this.socketService) {
        this.socketService.broadcastToLocation(spaceLocationId, 'closures_updated', { spaceId });
      }

      res.status(201).json({ success: true, data: closure });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  deleteClosure = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { closureId } = req.params;
      if (!closureId) {
        return res.status(400).json({ error: 'closureId is required' });
      }

      // Verify the closure belongs to the employee's location
      const closure = await this.spaceService.getClosureById(closureId);
      if (!closure) {
        return res.status(404).json({ error: 'Closure not found' });
      }
      const closureLocationId = await this.spaceService.getSpaceLocationId(closure.space_id);
      if (!closureLocationId || !req.employeeProfile?.accessibleLocationIds?.includes(closureLocationId)) {
        return res.status(403).json({ error: 'Access denied: closure belongs to a different location' });
      }

      const result = await this.spaceService.deleteClosure(closureId);

      // Broadcast update
      if (this.socketService) {
        const spaceLocationId = await this.spaceService.getSpaceLocationId(result.spaceId);
        if (spaceLocationId) {
          this.socketService.broadcastToLocation(spaceLocationId, 'closures_updated', { spaceId: result.spaceId });
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
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

      const updatedSpaces = await this.spaceService.activateLeagueMode(locationId, leagueId);

      // Broadcast to kiosks
      if (this.socketService) {
        this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
          active: true,
          leagueId,
          locationId,
        });
      }

      res.status(200).json({ message: 'League mode activated', spaces: updatedSpaces });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  deactivateLeagueMode = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.body;

      if (!locationId) {
        return res.status(400).json({ message: 'locationId is required' });
      }

      const updatedSpaces = await this.spaceService.deactivateLeagueMode(locationId);

      // Broadcast to kiosks
      if (this.socketService) {
        this.socketService.broadcastToLocation(locationId, 'league_mode_changed', {
          active: false,
          leagueId: null,
          locationId,
        });
      }

      res.status(200).json({ message: 'League mode deactivated', spaces: updatedSpaces });
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  toggleSpaceLeagueMode = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { spaceId } = req.params;
      const { active, leagueId } = req.body;

      if (active === undefined) {
        return res.status(400).json({ message: 'active is required' });
      }

      const spaceLocationId = await this.spaceService.getSpaceLocationId(spaceId);
      if (!spaceLocationId) return res.status(404).json({ message: 'Space not found' });
      if (!req.employeeProfile?.accessibleLocationIds?.includes(spaceLocationId)) {
        return res.status(403).json({ message: 'Access denied: space belongs to a different location' });
      }

      const updatedSpace = await this.spaceService.toggleSpaceLeagueMode(spaceId, active, leagueId || null);

      // Broadcast to the specific kiosk
      if (this.socketService) {
        this.socketService.broadcastToLocation(updatedSpace.location_id, 'league_mode_changed', {
          active,
          leagueId: active ? leagueId : null,
          spaceId,
          locationId: updatedSpace.location_id,
        });
      }

      res.status(200).json(updatedSpace);
    } catch (error: any) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
}
