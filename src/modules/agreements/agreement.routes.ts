import { Router } from 'express';
import { body, param } from 'express-validator';
import { agreementController } from './agreement.controller';
import { authenticateUser, authenticateEmployee } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

const router = Router();

router.post('/accept',
  body('signerName').isString().notEmpty().withMessage('signerName is required'),
  body('signerEmail').isEmail().withMessage('signerEmail must be a valid email'),
  body('bookingId').isUUID().withMessage('bookingId must be a valid UUID'),
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('agreements').isArray({ min: 1 }).withMessage('agreements must be a non-empty array'),
  body('documentHashes').isObject().withMessage('documentHashes must be an object'),
  handleValidationErrors,
  authenticateUser,
  (req, res) => agreementController.acceptAgreements(req, res),
);

router.get('/check/:bookingId',
  param('bookingId').isUUID().withMessage('bookingId must be a valid UUID'),
  handleValidationErrors,
  authenticateUser,
  (req, res) => agreementController.checkAgreements(req, res),
);

router.get('/booking/:bookingId',
  param('bookingId').isUUID().withMessage('bookingId must be a valid UUID'),
  handleValidationErrors,
  authenticateEmployee,
  (req, res) => agreementController.getBookingAgreements(req, res),
);

export default router;
