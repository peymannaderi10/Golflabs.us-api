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
const logger_1 = require("../../shared/utils/logger");
class PromotionController {
    /**
     * GET /promotions/user/:userId
     * Get all available promotions for a user
     */
    getUserPromotions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { userId } = req.params;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const promotions = yield promotion_service_1.promotionService.getUserAvailablePromotions(userId);
                return res.json({ promotions });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error getting user promotions');
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
            var _a;
            try {
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const { userId } = req.params;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const result = yield promotion_service_1.promotionService.hasFirstBookingPromo(userId);
                return res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error checking first booking promo');
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
                const userId = req.user.id;
                const { locationId, date, startTime, endTime, originalAmount } = req.body;
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
                logger_1.logger.error({ err: error }, 'Error calculating discount');
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
                const userId = req.user.id;
                const { bookingId, promotionId, discountAmount, freeMinutes } = req.body;
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
                logger_1.logger.error({ err: error }, 'Error applying promotion');
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
                const userId = req.user.id;
                const { code } = req.body;
                if (!code) {
                    return res.status(400).json({ error: 'code is required' });
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
                logger_1.logger.error({ err: error }, 'Error redeeming promotion code');
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
            var _a;
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
                // Check single-use enforcement: has this user already used this code?
                if (promotion.is_single_use) {
                    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (userId) {
                        const alreadyUsed = yield promotion_service_1.promotionService.hasUserUsedPromotion(userId, promotion.id);
                        if (alreadyUsed) {
                            return res.status(400).json({ error: 'You have already used this promo code' });
                        }
                    }
                }
                // Calculate the discount this code would give
                const discount = yield promotion_service_1.promotionService.calculateDiscountForPromotion(promotion, locationId, date, startTime, endTime, originalAmount);
                return res.json(discount);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error validating promo code');
                return res.status(400).json({
                    error: error instanceof Error ? error.message : 'Failed to validate code'
                });
            }
        });
    }
    /**
     * GET /promotions
     * Get all promotions (admin), optionally filtered by locationId query param
     */
    getAllPromotions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const locationId = req.query.locationId;
                const promotions = yield promotion_service_1.promotionService.getAllPromotions(locationId);
                return res.json({ promotions });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error getting all promotions');
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to get promotions'
                });
            }
        });
    }
    /**
     * Verify that the promotion belongs to the employee's location.
     * Returns the promotion if authorized, or sends a 403/404 and returns null.
     */
    verifyPromotionOwnership(req, res, promotionId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const accessibleIds = (_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.accessibleLocationIds;
            const promo = yield promotion_service_1.promotionService.getPromotionById(promotionId);
            if (!promo) {
                res.status(404).json({ error: 'Promotion not found' });
                return null;
            }
            if (!promo.location_id || !(accessibleIds === null || accessibleIds === void 0 ? void 0 : accessibleIds.includes(promo.location_id))) {
                res.status(403).json({ error: 'Access denied: you do not have access to this location' });
                return null;
            }
            return promo;
        });
    }
    /**
     * POST /promotions
     * Create a new promotion (employee)
     */
    createPromotion(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, name, code, description, discountType, discountValue, maxDiscountAmount, minBookingMinutes, maxFreeMinutes, isAutoAssigned, isSingleUse, validFrom, validTo } = req.body;
                const promotion = yield promotion_service_1.promotionService.createPromotion({
                    locationId, name, code, description, discountType, discountValue,
                    maxDiscountAmount, minBookingMinutes, maxFreeMinutes,
                    isAutoAssigned, isSingleUse, validFrom, validTo,
                });
                return res.status(201).json({ success: true, promotion });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error creating promotion');
                const message = error instanceof Error ? error.message : 'Failed to create promotion';
                const status = message.includes('already exists') ? 409 : 500;
                return res.status(status).json({ error: message });
            }
        });
    }
    /**
     * PUT /promotions/:id
     * Update a promotion (employee)
     */
    updatePromotion(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const existing = yield this.verifyPromotionOwnership(req, res, id);
                if (!existing)
                    return;
                const { name, code, description, discountType, discountValue, maxDiscountAmount, minBookingMinutes, maxFreeMinutes, isAutoAssigned, isSingleUse, isActive, validFrom, validTo } = req.body;
                const promotion = yield promotion_service_1.promotionService.updatePromotion(id, {
                    name, code, description, discountType, discountValue,
                    maxDiscountAmount, minBookingMinutes, maxFreeMinutes,
                    isAutoAssigned, isSingleUse, isActive, validFrom, validTo,
                });
                return res.json({ success: true, promotion });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error updating promotion');
                const message = error instanceof Error ? error.message : 'Failed to update promotion';
                const status = message.includes('already exists') ? 409 : 500;
                return res.status(status).json({ error: message });
            }
        });
    }
    /**
     * DELETE /promotions/:id
     * Soft-delete (deactivate) a promotion (employee)
     */
    deletePromotion(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const existing = yield this.verifyPromotionOwnership(req, res, id);
                if (!existing)
                    return;
                yield promotion_service_1.promotionService.deactivatePromotion(id);
                return res.json({ success: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error deactivating promotion');
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to deactivate promotion'
                });
            }
        });
    }
    /**
     * GET /promotions/:id/usage
     * Get usage stats for a promotion (employee)
     */
    getUsageStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const existing = yield this.verifyPromotionOwnership(req, res, id);
                if (!existing)
                    return;
                const stats = yield promotion_service_1.promotionService.getPromotionUsageStats(id);
                return res.json(stats);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error getting promotion usage stats');
                return res.status(500).json({
                    error: error instanceof Error ? error.message : 'Failed to get usage stats'
                });
            }
        });
    }
}
exports.PromotionController = PromotionController;
exports.promotionController = new PromotionController();
