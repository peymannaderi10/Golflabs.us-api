import { Router } from 'express';
import { promotionController } from './promotion.controller';
import { authenticateUser, authenticateEmployee } from '../auth';

const router = Router();

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

// Get all promotions (admin only)
router.get('/', authenticateEmployee, (req, res) => promotionController.getAllPromotions(req, res));

export default router;
