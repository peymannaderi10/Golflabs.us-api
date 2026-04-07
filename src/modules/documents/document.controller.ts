import { Request, Response } from 'express';
import { documentService } from './document.service';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';
import { DocumentType } from './document.types';

class DocumentController {
  async getActiveDocuments(req: Request, res: Response) {
    try {
      const locationId = req.query.locationId as string;

      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }

      const documents = await documentService.getActiveDocuments(locationId);
      res.json({ success: true, data: documents });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Error fetching active documents');
      res.status(500).json({ error: sanitizeError(error) });
    }
  }

  async getDocumentHistory(req: Request, res: Response) {
    try {
      const locationId = req.query.locationId as string;
      const documentType = req.query.documentType as DocumentType;

      if (!locationId || !documentType) {
        return res.status(400).json({ error: 'locationId and documentType are required' });
      }

      const history = await documentService.getDocumentHistory(locationId, documentType);

      res.json({ success: true, data: history });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Error fetching document history');
      if (error instanceof Error && error.message.includes('Invalid document type')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  }

  async publishDocument(req: Request, res: Response) {
    try {
      const { locationId, documentType, title, content } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const document = await documentService.publishDocument({
        locationId,
        documentType,
        title,
        content,
        publishedBy: userId,
      });

      res.status(201).json({ success: true, data: document });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Error publishing document');
      if (error instanceof Error && (error.message.includes('Invalid document type') || error.message.includes('at least 100 characters'))) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  }
}

export const documentController = new DocumentController();
