import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { KioskService } from './kiosk.service';
import {
  KioskError,
  registerKioskSchema,
  restartKioskSchema,
  updateKioskSettingsSchema,
} from './kiosk.types';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { logger } from '../../shared/utils/logger';

function handleError(error: unknown, res: Response, context: string): Response {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: error.issues[0]?.message || 'Invalid input',
    });
  }
  if (error instanceof KioskError) {
    return res.status(error.statusCode).json({ success: false, error: error.message });
  }
  logger.error({ err: error, context }, 'Unexpected error in kiosk controller');
  return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
}

function requireOwnerOrAdmin(req: AuthenticatedRequest, res: Response): boolean {
  const role = req.employeeProfile?.clientRole;
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({ success: false, error: 'Only owners or admins can manage kiosks' });
    return false;
  }
  return true;
}

export class KioskController {
  constructor(private readonly service: KioskService) {}

  // -------- kiosk-authenticated --------

  /** GET /kiosk/locations/:locationId/spaces */
  listUnclaimedSpaces = async (req: Request, res: Response) => {
    try {
      const result = await this.service.listUnclaimedSpacesForLocation(req.params.locationId);
      res.json({ success: true, data: result });
    } catch (error) {
      handleError(error, res, 'kiosk.listUnclaimedSpaces');
    }
  };

  /** POST /kiosk/register */
  register = async (req: Request, res: Response) => {
    try {
      const parsed = registerKioskSchema.parse(req.body);
      const settings = await this.service.registerKiosk(parsed);
      res.status(201).json({ success: true, data: settings });
    } catch (error) {
      handleError(error, res, 'kiosk.register');
    }
  };

  /** GET /kiosk/settings/:installationId */
  getSettingsByInstallation = async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boundInstallationId = authReq.kioskInstallationId;
      if (!boundInstallationId) {
        return res.status(401).json({
          success: false,
          error: 'X-Kiosk-Installation-Id header required',
        });
      }
      if (boundInstallationId !== req.params.installationId) {
        logger.warn(
          { bound: boundInstallationId, requested: req.params.installationId },
          'Kiosk attempted to fetch settings for a different installation'
        );
        return res.status(403).json({
          success: false,
          error: 'Installation id mismatch',
        });
      }
      const settings = await this.service.getSettingsByInstallation(req.params.installationId);
      res.json({ success: true, data: settings });
    } catch (error) {
      handleError(error, res, 'kiosk.getSettingsByInstallation');
    }
  };

  // -------- employee-authenticated --------

  /** GET /kiosk/by-space/:spaceId */
  getSettingsBySpace = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const settings = await this.service.getSettingsBySpace(req.params.spaceId);
      res.json({ success: true, data: settings });
    } catch (error) {
      handleError(error, res, 'kiosk.getSettingsBySpace');
    }
  };

  /** PATCH /kiosk/by-space/:spaceId */
  updateSettings = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;
      const parsed = updateKioskSettingsSchema.parse(req.body);
      const settings = await this.service.updateSettings(req.params.spaceId, parsed);
      res.json({ success: true, data: settings });
    } catch (error) {
      handleError(error, res, 'kiosk.updateSettings');
    }
  };

  /** POST /kiosk/by-space/:spaceId/restart */
  restart = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;
      const parsed = restartKioskSchema.parse(req.body);
      await this.service.triggerRestart(req.params.spaceId, parsed?.reason);
      res.json({ success: true, data: { ok: true } });
    } catch (error) {
      handleError(error, res, 'kiosk.restart');
    }
  };

  /** POST /kiosk/by-space/:spaceId/clear-installation */
  clearInstallation = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;
      const settings = await this.service.clearInstallation(req.params.spaceId);
      res.json({ success: true, data: settings });
    } catch (error) {
      handleError(error, res, 'kiosk.clearInstallation');
    }
  };
}
