"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promotion_controller_1 = require("./promotion.controller");
const router = (0, express_1.Router)();
// Get all available promotions for a user
router.get('/user/:userId', (req, res) => promotion_controller_1.promotionController.getUserPromotions(req, res));
// Check if user has first booking free promotion
router.get('/user/:userId/first-booking', (req, res) => promotion_controller_1.promotionController.checkFirstBookingPromo(req, res));
// Calculate discount for a booking
router.post('/calculate-discount', (req, res) => promotion_controller_1.promotionController.calculateDiscount(req, res));
// Apply a promotion to a booking
router.post('/apply', (req, res) => promotion_controller_1.promotionController.applyPromotion(req, res));
// Redeem a promotion code (assigns to user permanently)
router.post('/redeem-code', (req, res) => promotion_controller_1.promotionController.redeemCode(req, res));
// Validate a promo code and calculate discount (doesn't assign, just calculates)
router.post('/validate-code', (req, res) => promotion_controller_1.promotionController.validateCode(req, res));
// Get all promotions (admin)
router.get('/', (req, res) => promotion_controller_1.promotionController.getAllPromotions(req, res));
exports.default = router;
