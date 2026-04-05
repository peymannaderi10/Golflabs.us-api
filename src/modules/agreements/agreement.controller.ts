import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { agreementService } from './agreement.service';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';

export class AgreementController {
  acceptAgreements = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const {
        signerName,
        signerEmail,
        bookingId,
        locationId,
        agreements,
        documentHashes,
      } = req.body;

      if (!userId || !bookingId || !locationId || !agreements) {
        return res.status(400).json({
          error: 'bookingId, locationId, and agreements are required',
        });
      }

      if (!signerName || !signerEmail) {
        return res.status(400).json({
          error: 'signerName and signerEmail are required for consent records',
        });
      }

      if (!Array.isArray(agreements) || agreements.length === 0) {
        return res.status(400).json({
          error: 'agreements must be a non-empty array of agreement types',
        });
      }

      if (!documentHashes || typeof documentHashes !== 'object') {
        return res.status(400).json({
          error: 'documentHashes must be an object mapping agreement types to SHA-256 hashes',
        });
      }

      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        undefined;
      const userAgent = req.headers['user-agent'] || undefined;

      const result = await agreementService.recordAgreements({
        userId,
        signerName,
        signerEmail,
        bookingId,
        locationId,
        agreements,
        documentHashes,
        ipAddress,
        userAgent,
      });

      res.status(201).json({
        success: true,
        alreadyRecorded: result.alreadyRecorded,
        count: result.count,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error accepting agreements');
      if (error.message.includes('Missing required')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  checkAgreements = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = req.user?.id;

      if (!bookingId || !userId) {
        return res.status(400).json({
          error: 'bookingId (param) is required and user must be authenticated',
        });
      }

      const result = await agreementService.checkAgreements(
        userId,
        bookingId
      );

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking agreements');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
  getBookingAgreements = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      if (!bookingId) {
        return res.status(400).json({ error: 'bookingId is required' });
      }

      // Location-scoped access check: employee must belong to the booking's location
      const employeeLocationId = req.user?.locationId;
      const bookingLocationId = await agreementService.getBookingLocationId(bookingId);
      if (!bookingLocationId) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      if (employeeLocationId && bookingLocationId !== employeeLocationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const agreements = await agreementService.getBookingAgreements(bookingId);
      res.json({ success: true, data: agreements });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Error fetching booking agreements');
      res.status(500).json({ error: 'Failed to fetch booking agreements' });
    }
  };
}

export const agreementController = new AgreementController();
