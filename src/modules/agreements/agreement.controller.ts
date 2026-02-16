import { Request, Response } from 'express';
import { agreementService } from './agreement.service';

export class AgreementController {
  acceptAgreements = async (req: Request, res: Response) => {
    try {
      const {
        userId,
        signerName,
        signerEmail,
        bookingId,
        locationId,
        agreements,
        documentHashes,
      } = req.body;

      if (!userId || !bookingId || !locationId || !agreements) {
        return res.status(400).json({
          error: 'userId, bookingId, locationId, and agreements are required',
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
      console.error('Error accepting agreements:', error);
      if (error.message.includes('Missing required')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to record agreements' });
    }
  };

  checkAgreements = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { userId } = req.query;

      if (!bookingId || !userId) {
        return res.status(400).json({
          error: 'bookingId (param) and userId (query) are required',
        });
      }

      const result = await agreementService.checkAgreements(
        userId as string,
        bookingId
      );

      res.json(result);
    } catch (error: any) {
      console.error('Error checking agreements:', error);
      res.status(500).json({ error: error.message || 'Failed to check agreements' });
    }
  };
}

export const agreementController = new AgreementController();
