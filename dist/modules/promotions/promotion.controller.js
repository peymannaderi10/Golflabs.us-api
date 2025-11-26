"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promotionController = exports.PromotionController = void 0;
const promotion_service_1 = require("./promotion.service");
class PromotionController {
    /**
     * GET /promotions/user/:userId
     * Get all available promotions for a user
     */
    getUserPromotions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                const promotions = yield promotion_service_1.promotionService.getUserAvailablePromotions(userId);
                return res.json({ promotions });
            }
            catch (error) {
                console.error('Error getting user promotions:', error);
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to get promotions'
                });
            }
        });
    }
    /**
     * GET /promotions/user/:userId/first-booking
     * Check if user has the first booking free promotion
     */
    checkFirstBookingPromo(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                const result = yield promotion_service_1.promotionService.hasFirstBookingPromo(userId);
                return res.json(result);
            }
            catch (error) {
                console.error('Error checking first booking promo:', error);
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to check promotion'
                });
            }
        });
    }
    /**
     * POST /promotions/calculate-discount
     * Calculate the discount for a potential booking
     * Accepts date and time strings, backend handles all conversion
     */
    calculateDiscount(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId, locationId, date, startTime, endTime, originalAmount } = req.body;
                if (!userId || originalAmount === undefined) {
                    return res.status(400).json({
                        error: 'userId and originalAmount are required'
                    });
                }
                if (!locationId || !date || !startTime || !endTime) {
                    return res.status(400).json({
                        error: 'locationId, date, startTime, and endTime are required'
                    });
                }
                const discount = yield promotion_service_1.promotionService.calculateDiscountWithPricing({
                    userId,
                    locationId,
                    date,
                    startTime,
                    endTime,
                    originalAmount
                });
                return res.json(discount);
            }
            catch (error) {
                console.error('Error calculating discount:', error);
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to calculate discount'
                });
            }
        });
    }
    /**
     * POST /promotions/apply
     * Apply a promotion to a booking (called after payment success)
     */
    applyPromotion(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId, bookingId, promotionId, discountAmount, freeMinutes } = req.body;
                if (!userId || !bookingId || !promotionId) {
                    return res.status(400).json({
                        error: 'userId, bookingId, and promotionId are required'
                    });
                }
                const success = yield promotion_service_1.promotionService.applyPromotion({
                    userId,
                    bookingId,
                    promotionId,
                    discountAmount: discountAmount || 0,
                    freeMinutes
                });
                return res.json({ success });
            }
            catch (error) {
                console.error('Error applying promotion:', error);
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to apply promotion'
                });
            }
        });
    }
    /**
     * POST /promotions/redeem-code
     * Redeem a promotion code for a user (assigns permanently)
     */
    redeemCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId, code } = req.body;
                if (!userId || !code) {
                    return res.status(400).json({ error: 'userId and code are required' });
                }
                // Find the promotion by code
                const promotion = yield promotion_service_1.promotionService.getPromotionByCode(code);
                if (!promotion) {
                    return res.status(404).json({ error: 'Invalid or expired promotion code' });
                }
                // Assign to user
                yield promotion_service_1.promotionService.assignPromotionToUser(userId, promotion.id);
                return res.json({
                    success: true,
                    promotion: {
                        id: promotion.id,
                        name: promotion.name,
                        description: promotion.description,
                        discountType: promotion.discount_type,
                        discountValue: promotion.discount_value
                    }
                });
            }
            catch (error) {
                console.error('Error redeeming promotion code:', error);
                return res.status(400).json({
                    error: error instanceof Error ? error.message : 'Failed to redeem code'
                });
            }
        });
    }
    /**
     * POST /promotions/validate-code
     * Validate a promo code and calculate the discount for the current booking
     * Does NOT assign the code to the user - just calculates what the discount would be
     */
    validateCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { code, locationId, date, startTime, endTime, originalAmount } = req.body;
                if (!code) {
                    return res.status(400).json({ error: 'Promo code is required' });
                }
                if (!locationId || !date || !startTime || !endTime || originalAmount === undefined) {
                    return res.status(400).json({
                        error: 'locationId, date, startTime, endTime, and originalAmount are required'
                    });
                }
                // Find the promotion by code
                const promotion = yield promotion_service_1.promotionService.getPromotionByCode(code);
                if (!promotion) {
                    return res.status(404).json({ error: 'Invalid or expired promo code' });
                }
                // Calculate the discount this code would give
                const discount = yield promotion_service_1.promotionService.calculateDiscountForPromotion(promotion, locationId, date, startTime, endTime, originalAmount);
                return res.json(discount);
            }
            catch (error) {
                console.error('Error validating promo code:', error);
                return res.status(400).json({
                    error: error instanceof Error ? error.message : 'Failed to validate code'
                });
            }
        });
    }
    /**
     * GET /promotions
     * Get all promotions (admin)
     */
    getAllPromotions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const promotions = yield promotion_service_1.promotionService.getAllPromotions();
                return res.json({ promotions });
            }
            catch (error) {
                console.error('Error getting all promotions:', error);
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to get promotions'
                });
            }
        });
    }
}
exports.PromotionController = PromotionController;
exports.promotionController = new PromotionController();
