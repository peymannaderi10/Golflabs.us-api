import { Router, Request, Response } from 'express';
import { promotionController } from './promotion.controller';
import { authenticateUser, authenticateEmployee, validateLocationAccess } from '../auth';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../../shared/middleware/validation';

const router = Router();

// --- Employee CRUD routes ---

// Create a new promotion (employee, location-scoped)
router.post('/', authenticateEmployee, validateLocationAccess('body'), [
  body('locationId').isUUID().withMessage('locationId must be a valid UUID'),
  body('name').isString().trim().notEmpty().withMessage('name is required'),
  body('discountType').isIn(['fixed', 'percentage', 'free_minutes']).withMessage('discountType must be fixed, percentage, or free_minutes'),
  body('discountValue').isFloat({ min: 0 }).withMessage('discountValue must be a positive number'),
  body('code').optional({ values: 'null' }).isString().trim(),
  body('description').optional({ values: 'null' }).isString().trim(),
  body('maxDiscountAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('minBookingMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
  body('maxFreeMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
  body('isAutoAssigned').isBoolean().withMessage('isAutoAssigned is required'),
  body('isSingleUse').isBoolean().withMessage('isSingleUse is required'),
  body('validFrom').optional({ values: 'null' }).isISO8601(),
  body('validTo').optional({ values: 'null' }).isISO8601(),
  handleValidationErrors,
], (req: Request, res: Response) => promotionController.createPromotion(req, res));

// Update a promotion (employee)
router.put('/:id', authenticateEmployee, [
  param('id').isUUID().withMessage('id must be a valid UUID'),
  body('name').optional().isString().trim().notEmpty(),
  body('discountType').optional().isIn(['fixed', 'percentage', 'free_minutes']),
  body('discountValue').optional().isFloat({ min: 0 }),
  body('code').optional({ values: 'null' }).isString().trim(),
  body('description').optional({ values: 'null' }).isString().trim(),
  body('maxDiscountAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('minBookingMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
  body('maxFreeMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
  body('isAutoAssigned').optional().isBoolean(),
  body('isSingleUse').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  body('validFrom').optional({ values: 'null' }).isISO8601(),
  body('validTo').optional({ values: 'null' }).isISO8601(),
  handleValidationErrors,
], (req: Request, res: Response) => promotionController.updatePromotion(req, res));

// Deactivate a promotion (soft-delete)
router.delete('/:id', authenticateEmployee, [
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
], (req: Request, res: Response) => promotionController.deletePromotion(req, res));

// Get usage stats for a promotion
router.get('/:id/usage', authenticateEmployee, [
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
], (req: Request, res: Response) => promotionController.getUsageStats(req, res));

// --- Existing routes ---

// Get all promotions (employee, scoped to their location)
router.get('/', authenticateEmployee, validateLocationAccess('query'), (req, res) => promotionController.getAllPromotions(req, res));

// Get all available promotions for a user
router.get('/user/:userId', authenticateUser, (req, res) => promotionController.getUserPromotions(req, res));

// Check if user has first booking free promotion
router.get('/user/:userId/first-booking', authenticateUser, (req, res) => promotionController.checkFirstBookingPromo(req, res));

// Calculate discount for a booking
router.post('/calculate-discount', authenticateUser, (req, res) => promotionController.calculateDiscount(req, res));

// Apply a promotion to a booking
router.post('/apply', authenticateUser, (req, res) => promotionController.applyPromotion(req, res));

// Redeem a promotion code (assigns to user permanently)
router.post('/redeem-code', authenticateUser, (req, res) => promotionController.redeemCode(req, res));

// Validate a promo code and calculate discount (doesn't assign, just calculates)
router.post('/validate-code', authenticateUser, (req, res) => promotionController.validateCode(req, res));

export default router;
