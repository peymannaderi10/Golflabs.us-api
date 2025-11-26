import { Router } from 'express';
import { promotionController } from './promotion.controller';

const router = Router();

// Get all available promotions for a user
router.get('/user/:userId', (req, res) => promotionController.getUserPromotions(req, res));

// Check if user has first booking free promotion
router.get('/user/:userId/first-booking', (req, res) => promotionController.checkFirstBookingPromo(req, res));

// Calculate discount for a booking
router.post('/calculate-discount', (req, res) => promotionController.calculateDiscount(req, res));

// Apply a promotion to a booking
router.post('/apply', (req, res) => promotionController.applyPromotion(req, res));

// Redeem a promotion code (assigns to user permanently)
router.post('/redeem-code', (req, res) => promotionController.redeemCode(req, res));

// Validate a promo code and calculate discount (doesn't assign, just calculates)
router.post('/validate-code', (req, res) => promotionController.validateCode(req, res));

// Get all promotions (admin)
router.get('/', (req, res) => promotionController.getAllPromotions(req, res));

export default router;

