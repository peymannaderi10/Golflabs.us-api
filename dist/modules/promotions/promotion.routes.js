"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promotion_controller_1 = require("./promotion.controller");
const auth_1 = require("../auth");
const express_validator_1 = require("express-validator");
const validation_1 = require("../../shared/middleware/validation");
const router = (0, express_1.Router)();
// --- Employee CRUD routes ---
// Create a new promotion (employee, location-scoped)
router.post('/', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('body'), [
    (0, express_validator_1.body)('locationId').isUUID().withMessage('locationId must be a valid UUID'),
    (0, express_validator_1.body)('name').isString().trim().notEmpty().withMessage('name is required'),
    (0, express_validator_1.body)('discountType').isIn(['fixed', 'percentage', 'free_minutes']).withMessage('discountType must be fixed, percentage, or free_minutes'),
    (0, express_validator_1.body)('discountValue').isFloat({ min: 0 }).withMessage('discountValue must be a positive number'),
    (0, express_validator_1.body)('code').optional({ values: 'null' }).isString().trim(),
    (0, express_validator_1.body)('description').optional({ values: 'null' }).isString().trim(),
    (0, express_validator_1.body)('maxDiscountAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
    (0, express_validator_1.body)('minBookingMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
    (0, express_validator_1.body)('maxFreeMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
    (0, express_validator_1.body)('isAutoAssigned').isBoolean().withMessage('isAutoAssigned is required'),
    (0, express_validator_1.body)('isSingleUse').isBoolean().withMessage('isSingleUse is required'),
    (0, express_validator_1.body)('validFrom').optional({ values: 'null' }).isISO8601(),
    (0, express_validator_1.body)('validTo').optional({ values: 'null' }).isISO8601(),
    validation_1.handleValidationErrors,
], (req, res) => promotion_controller_1.promotionController.createPromotion(req, res));
// Update a promotion (employee)
router.put('/:id', auth_1.authenticateEmployee, [
    (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'),
    (0, express_validator_1.body)('name').optional().isString().trim().notEmpty(),
    (0, express_validator_1.body)('discountType').optional().isIn(['fixed', 'percentage', 'free_minutes']),
    (0, express_validator_1.body)('discountValue').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('code').optional({ values: 'null' }).isString().trim(),
    (0, express_validator_1.body)('description').optional({ values: 'null' }).isString().trim(),
    (0, express_validator_1.body)('maxDiscountAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
    (0, express_validator_1.body)('minBookingMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
    (0, express_validator_1.body)('maxFreeMinutes').optional({ values: 'null' }).isInt({ min: 0 }),
    (0, express_validator_1.body)('isAutoAssigned').optional().isBoolean(),
    (0, express_validator_1.body)('isSingleUse').optional().isBoolean(),
    (0, express_validator_1.body)('isActive').optional().isBoolean(),
    (0, express_validator_1.body)('validFrom').optional({ values: 'null' }).isISO8601(),
    (0, express_validator_1.body)('validTo').optional({ values: 'null' }).isISO8601(),
    validation_1.handleValidationErrors,
], (req, res) => promotion_controller_1.promotionController.updatePromotion(req, res));
// Deactivate a promotion (soft-delete)
router.delete('/:id', auth_1.authenticateEmployee, [
    (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'),
    validation_1.handleValidationErrors,
], (req, res) => promotion_controller_1.promotionController.deletePromotion(req, res));
// Get usage stats for a promotion
router.get('/:id/usage', auth_1.authenticateEmployee, [
    (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'),
    validation_1.handleValidationErrors,
], (req, res) => promotion_controller_1.promotionController.getUsageStats(req, res));
// --- Existing routes ---
// Get all promotions (employee, scoped to their location)
router.get('/', auth_1.authenticateEmployee, (0, auth_1.validateLocationAccess)('query'), (req, res) => promotion_controller_1.promotionController.getAllPromotions(req, res));
// Get all available promotions for a user
router.get('/user/:userId', auth_1.authenticateUser, (req, res) => promotion_controller_1.promotionController.getUserPromotions(req, res));
// Check if user has first booking free promotion
router.get('/user/:userId/first-booking', auth_1.authenticateUser, (req, res) => promotion_controller_1.promotionController.checkFirstBookingPromo(req, res));
// Calculate discount for a booking
router.post('/calculate-discount', auth_1.authenticateUser, (req, res) => promotion_controller_1.promotionController.calculateDiscount(req, res));
// Apply a promotion to a booking
router.post('/apply', auth_1.authenticateUser, (req, res) => promotion_controller_1.promotionController.applyPromotion(req, res));
// Redeem a promotion code (assigns to user permanently)
router.post('/redeem-code', auth_1.authenticateUser, (req, res) => promotion_controller_1.promotionController.redeemCode(req, res));
// Validate a promo code and calculate discount (doesn't assign, just calculates)
router.post('/validate-code', auth_1.authenticateUser, (req, res) => promotion_controller_1.promotionController.validateCode(req, res));
exports.default = router;
