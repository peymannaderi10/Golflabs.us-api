import { Router } from 'express';
import { query, body } from 'express-validator';
import { documentController } from './document.controller';
import { authenticateEmployee, enforceLocationScope } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

const router = Router();

// Public — customers need this during checkout
router.get(
  '/active',
  query('locationId').isUUID().withMessage('locationId is required'),
  handleValidationErrors,
  (req, res) => documentController.getActiveDocuments(req, res),
);

// Employee-only — auth + location access first, then validate
router.get(
  '/history',
  authenticateEmployee,
  enforceLocationScope,
  query('locationId').isUUID(),
  query('documentType').isString().notEmpty(),
  handleValidationErrors,
  (req, res) => documentController.getDocumentHistory(req, res),
);

// Employee-only — auth + location access first, then validate
router.post(
  '/publish',
  authenticateEmployee,
  enforceLocationScope,
  body('locationId').isUUID(),
  body('documentType').isString().notEmpty(),
  body('title').isString().notEmpty(),
  body('content').isString().isLength({ min: 100 }).withMessage('Document content must be at least 100 characters'),
  handleValidationErrors,
  (req, res) => documentController.publishDocument(req, res),
);

export default router;
