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
exports.promotionService = exports.PromotionService = void 0;
const database_1 = require("../../config/database");
const date_utils_1 = require("../../shared/utils/date.utils");
const logger_1 = require("../../shared/utils/logger");
const pricing_utils_1 = require("../../shared/utils/pricing.utils");
class PromotionService {
    /**
     * Get all available promotions for a user (unredeemed)
     */
    getUserAvailablePromotions(userId, locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            // `!inner` makes `promotion.location_id` filterable at the DB level so
            // tenants don't see each other's promotions.
            const { data, error } = yield database_1.supabase
                .from('user_promotions')
                .select(`
        *,
        promotion:promotions!inner(*)
      `)
                .eq('user_id', userId)
                .eq('promotion.location_id', locationId)
                .is('redeemed_at', null)
                .order('created_at', { ascending: false });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching user promotions');
                throw new Error('Failed to fetch user promotions');
            }
            // Filter to only active and valid promotions
            const now = new Date().toISOString();
            const validPromotions = (data || []).filter((up) => {
                const promo = up.promotion;
                if (!promo || !promo.is_active)
                    return false;
                if (promo.location_id !== locationId)
                    return false; // belt-and-suspenders
                if (promo.valid_from && promo.valid_from > now)
                    return false;
                if (promo.valid_to && promo.valid_to < now)
                    return false;
                if (up.expires_at && up.expires_at < now)
                    return false;
                return true;
            });
            return validPromotions;
        });
    }
    /**
     * Check if a user has the first booking free promotion available at a
     * specific location. Scoped per-location — a promo seeded at Location A
     * must NOT surface for a booking at Location B.
     */
    hasFirstBookingPromo(userId, locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId || !locationId) {
                return { available: false };
            }
            const { data, error } = yield database_1.supabase
                .from('user_promotions')
                .select(`
        *,
        promotion:promotions!inner(*)
      `)
                .eq('user_id', userId)
                .eq('promotion.location_id', locationId)
                .is('redeemed_at', null)
                .limit(1);
            if (error || !data || data.length === 0) {
                return { available: false };
            }
            const userPromo = data[0];
            const promo = userPromo.promotion;
            // Validate the promotion is still valid and location-scoped
            const now = new Date().toISOString();
            if (!promo || !promo.is_active)
                return { available: false };
            if (promo.location_id !== locationId)
                return { available: false };
            if (promo.valid_from && promo.valid_from > now)
                return { available: false };
            if (promo.valid_to && promo.valid_to < now)
                return { available: false };
            if (userPromo.expires_at && userPromo.expires_at < now)
                return { available: false };
            return {
                available: true,
                promotion: promo
            };
        });
    }
    /**
     * Calculate the discount for a booking using the database function
     */
    calculateDiscount(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const { userId, bookingMinutes, originalAmount, hourlyRate } = request;
            if (!userId) {
                return {
                    promotionId: null,
                    promotionName: null,
                    discountType: null,
                    discountAmount: 0,
                    freeMinutes: 0,
                    finalAmount: originalAmount,
                    originalAmount: originalAmount
                };
            }
            // Use the database function to calculate the discount
            const { data, error } = yield database_1.supabase.rpc('calculate_promotion_discount', {
                p_user_id: userId,
                p_booking_minutes: bookingMinutes,
                p_original_amount: originalAmount,
                p_hourly_rate: hourlyRate || null
            });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error calculating promotion discount');
                // Return no discount on error, don't fail the booking
                return {
                    promotionId: null,
                    promotionName: null,
                    discountType: null,
                    discountAmount: 0,
                    freeMinutes: 0,
                    finalAmount: originalAmount,
                    originalAmount: originalAmount
                };
            }
            // The RPC returns a single row
            const result = data === null || data === void 0 ? void 0 : data[0];
            if (!result || !result.promotion_id) {
                return {
                    promotionId: null,
                    promotionName: null,
                    discountType: null,
                    discountAmount: 0,
                    freeMinutes: 0,
                    finalAmount: originalAmount,
                    originalAmount: originalAmount
                };
            }
            return {
                promotionId: result.promotion_id,
                promotionName: result.promotion_name,
                discountType: result.discount_type,
                discountAmount: parseFloat(result.discount_amount) || 0,
                freeMinutes: result.free_minutes || 0,
                finalAmount: parseFloat(result.final_amount) || originalAmount,
                originalAmount: originalAmount
            };
        });
    }
    /**
     * Calculate discount without using the database function (for when user isn't in DB yet)
     * This is a simpler version that assumes the first-booking-free promotion
     */
    calculateDiscountSimple(userId_1, locationId_1, bookingMinutes_1, originalAmount_1) {
        return __awaiter(this, arguments, void 0, function* (userId, locationId, bookingMinutes, originalAmount, hourlyRate = 60) {
            // Check if user has an available promotion AT THIS LOCATION
            const { available, promotion } = yield this.hasFirstBookingPromo(userId, locationId);
            if (!available || !promotion) {
                return {
                    promotionId: null,
                    promotionName: null,
                    discountType: null,
                    discountAmount: 0,
                    freeMinutes: 0,
                    finalAmount: originalAmount,
                    originalAmount: originalAmount
                };
            }
            let discountAmount = 0;
            let freeMinutes = 0;
            switch (promotion.discount_type) {
                case 'free_minutes':
                    // Calculate free minutes (capped at max_free_minutes and booking duration)
                    freeMinutes = Math.min(promotion.discount_value, promotion.max_free_minutes || promotion.discount_value, bookingMinutes);
                    // Convert free minutes to dollar discount
                    discountAmount = (freeMinutes / 60) * hourlyRate;
                    break;
                case 'percentage':
                    discountAmount = originalAmount * (promotion.discount_value / 100);
                    // Apply max cap if set
                    if (promotion.max_discount_amount) {
                        discountAmount = Math.min(discountAmount, promotion.max_discount_amount);
                    }
                    break;
                case 'fixed':
                    discountAmount = Math.min(promotion.discount_value, originalAmount);
                    break;
            }
            // Ensure discount doesn't exceed original amount
            discountAmount = Math.min(discountAmount, originalAmount);
            const finalAmount = Math.max(0, originalAmount - discountAmount);
            return {
                promotionId: promotion.id,
                promotionName: promotion.name,
                discountType: promotion.discount_type,
                discountAmount: Math.round(discountAmount * 100) / 100,
                freeMinutes,
                finalAmount: Math.round(finalAmount * 100) / 100,
                originalAmount: originalAmount
            };
        });
    }
    /**
     * Calculate discount using actual booking times and pricing rules
     * This ensures correct discount calculation even when bookings span multiple pricing periods
     */
    calculateDiscountWithPricing(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const { userId, locationId, date, startTime, endTime, originalAmount } = request;
            // Check if user has an available promotion scoped to THIS location
            const { available, promotion } = yield this.hasFirstBookingPromo(userId, locationId);
            if (!available || !promotion) {
                return {
                    promotionId: null,
                    promotionName: null,
                    discountType: null,
                    discountAmount: 0,
                    freeMinutes: 0,
                    finalAmount: originalAmount,
                    originalAmount: originalAmount
                };
            }
            // For free_minutes, calculate using actual pricing rules
            try {
                // Get location timezone
                const { data: location, error: locationError } = yield database_1.supabase
                    .from('locations')
                    .select('timezone')
                    .eq('id', locationId)
                    .single();
                if (locationError || !location) {
                    logger_1.logger.error({ err: locationError }, 'Error fetching location for discount calculation');
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                const timezone = location.timezone || 'America/New_York';
                // Convert date and time strings to ISO timestamps using location timezone
                const startTimeISO = (0, date_utils_1.createISOTimestamp)(date, startTime, timezone);
                const endTimeISO = (0, date_utils_1.createISOTimestamp)(date, endTime, timezone);
                // For non-free_minutes promotions, use simple calculation
                if (promotion.discount_type !== 'free_minutes') {
                    const bookingMinutes = Math.round((new Date(endTimeISO).getTime() - new Date(startTimeISO).getTime()) / 60000);
                    return this.calculateDiscountSimple(userId, locationId, bookingMinutes, originalAmount);
                }
                // Use shared pricing context for user-type-aware discount calculation
                let ctx;
                try {
                    ctx = yield (0, pricing_utils_1.fetchPricingContext)(locationId, userId);
                }
                catch (err) {
                    logger_1.logger.error({ err }, 'Error fetching pricing context for discount calculation');
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                const { userTypeRules, defaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, false);
                const startDate = new Date(startTimeISO);
                const endDate = new Date(endTimeISO);
                const bookingMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
                const freeMinutes = Math.min(promotion.discount_value, promotion.max_free_minutes || promotion.discount_value, bookingMinutes);
                let discountAmount = 0;
                let minutesCounted = 0;
                let cursorTime = new Date(startDate);
                const freeEndTime = new Date(startDate.getTime() + freeMinutes * 60000);
                while (cursorTime < freeEndTime && minutesCounted < freeMinutes) {
                    const { localHour, dow } = (0, pricing_utils_1.localSlotInfo)(cursorTime, timezone);
                    const rule = (0, pricing_utils_1.findRuleForSlot)(userTypeRules, defaultRules, localHour, dow);
                    const priceForSlot = rule.hourly_rate / 4;
                    discountAmount += priceForSlot;
                    minutesCounted += 15;
                    cursorTime = new Date(cursorTime.getTime() + 15 * 60000);
                }
                if (minutesCounted > freeMinutes) {
                    const ratio = freeMinutes / minutesCounted;
                    discountAmount = discountAmount * ratio;
                }
                // Ensure discount doesn't exceed original amount
                discountAmount = Math.min(discountAmount, originalAmount);
                const finalAmount = Math.max(0, originalAmount - discountAmount);
                logger_1.logger.info({ freeMinutes, discountAmount: discountAmount.toFixed(2), originalAmount }, 'Discount calculation complete');
                return {
                    promotionId: promotion.id,
                    promotionName: promotion.name,
                    discountType: promotion.discount_type,
                    discountAmount: Math.round(discountAmount * 100) / 100,
                    freeMinutes,
                    finalAmount: Math.round(finalAmount * 100) / 100,
                    originalAmount: originalAmount
                };
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error calculating discount with pricing');
                return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
            }
        });
    }
    /**
     * Fallback discount calculation when pricing rules can't be fetched
     * Estimates hourly rate from the total booking price
     */
    fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount) {
        // Parse time strings to calculate duration
        const parseTime = (timeStr) => {
            const [time, period] = timeStr.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            if (period === 'PM' && hours !== 12)
                hours += 12;
            if (period === 'AM' && hours === 12)
                hours = 0;
            return hours * 60 + minutes;
        };
        const startMinutes = parseTime(startTime);
        const endMinutes = parseTime(endTime);
        const bookingMinutes = endMinutes > startMinutes
            ? endMinutes - startMinutes
            : (24 * 60 - startMinutes) + endMinutes;
        const bookingHours = bookingMinutes / 60;
        // Estimate hourly rate from booking price
        const estimatedHourlyRate = originalAmount / bookingHours;
        const freeMinutes = Math.min(promotion.discount_value, promotion.max_free_minutes || promotion.discount_value, bookingMinutes);
        const discountAmount = Math.min((freeMinutes / 60) * estimatedHourlyRate, originalAmount);
        const finalAmount = Math.max(0, originalAmount - discountAmount);
        return {
            promotionId: promotion.id,
            promotionName: promotion.name,
            discountType: promotion.discount_type,
            discountAmount: Math.round(discountAmount * 100) / 100,
            freeMinutes,
            finalAmount: Math.round(finalAmount * 100) / 100,
            originalAmount: originalAmount
        };
    }
    /**
     * Apply a promotion to a booking (mark as redeemed)
     */
    applyPromotion(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const { userId, bookingId, promotionId, discountAmount, freeMinutes } = request;
            // Use the database function for atomic operation
            const { error } = yield database_1.supabase.rpc('apply_promotion_to_booking', {
                p_user_id: userId,
                p_booking_id: bookingId,
                p_promotion_id: promotionId,
                p_discount_amount: discountAmount,
                p_free_minutes: freeMinutes || null
            });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error applying promotion to booking');
                throw new Error('Failed to apply promotion');
            }
            logger_1.logger.info({ promotionId, bookingId, userId }, 'Applied promotion to booking');
            return true;
        });
    }
    /**
     * Check if a user has already used a specific promotion (confirmed booking with this promotion_id)
     */
    hasUserUsedPromotion(userId, promotionId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check bookings table — any confirmed/cancelled booking that used this promo
            const { count } = yield database_1.supabase
                .from('bookings')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('promotion_id', promotionId)
                .in('status', ['confirmed', 'cancelled']);
            if (count && count > 0)
                return true;
            // Also check user_promotions for pre-assigned promos that were redeemed
            const { count: redeemedCount } = yield database_1.supabase
                .from('user_promotions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('promotion_id', promotionId)
                .not('redeemed_at', 'is', null);
            return (redeemedCount !== null && redeemedCount !== void 0 ? redeemedCount : 0) > 0;
        });
    }
    /**
     * Get promotion by code (for manual entry)
     */
    getPromotionByCode(code, locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!code || !locationId) {
                return null;
            }
            // Codes are unique PER LOCATION (see createPromotion), so the lookup
            // must be location-scoped or a shared code (e.g. "WELCOME15") would
            // leak across tenants.
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .select('*')
                .eq('location_id', locationId)
                .ilike('code', code.trim()) // Case-insensitive match
                .eq('is_active', true)
                .single();
            if (error || !data) {
                return null;
            }
            // Validate dates
            const now = new Date().toISOString();
            if (data.valid_from && data.valid_from > now)
                return null;
            if (data.valid_to && data.valid_to < now)
                return null;
            return data;
        });
    }
    /**
     * Calculate discount for a specific promotion (used for promo code validation)
     * This calculates what discount a promotion would give without checking user eligibility
     */
    calculateDiscountForPromotion(promotion, locationId, date, startTime, endTime, originalAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get location timezone
                const { data: location, error: locationError } = yield database_1.supabase
                    .from('locations')
                    .select('timezone')
                    .eq('id', locationId)
                    .single();
                if (locationError || !location) {
                    logger_1.logger.error({ err: locationError }, 'Error fetching location for promo code calculation');
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                const timezone = location.timezone || 'America/New_York';
                // Convert date and time strings to ISO timestamps
                const startTimeISO = (0, date_utils_1.createISOTimestamp)(date, startTime, timezone);
                const endTimeISO = (0, date_utils_1.createISOTimestamp)(date, endTime, timezone);
                // For non-free_minutes promotions
                if (promotion.discount_type !== 'free_minutes') {
                    const bookingMinutes = Math.round((new Date(endTimeISO).getTime() - new Date(startTimeISO).getTime()) / 60000);
                    const bookingHours = bookingMinutes / 60;
                    let discountAmount = 0;
                    switch (promotion.discount_type) {
                        case 'percentage':
                            discountAmount = originalAmount * (promotion.discount_value / 100);
                            if (promotion.max_discount_amount) {
                                discountAmount = Math.min(discountAmount, promotion.max_discount_amount);
                            }
                            break;
                        case 'fixed':
                            discountAmount = Math.min(promotion.discount_value, originalAmount);
                            break;
                    }
                    discountAmount = Math.min(discountAmount, originalAmount);
                    const finalAmount = Math.max(0, originalAmount - discountAmount);
                    return {
                        promotionId: promotion.id,
                        promotionName: promotion.name,
                        discountType: promotion.discount_type,
                        discountAmount: Math.round(discountAmount * 100) / 100,
                        freeMinutes: 0,
                        finalAmount: Math.round(finalAmount * 100) / 100,
                        originalAmount: originalAmount
                    };
                }
                // For free_minutes promotions, calculate using pricing rules (default type for promo codes)
                let ctx;
                try {
                    ctx = yield (0, pricing_utils_1.fetchPricingContext)(locationId);
                }
                catch (err) {
                    logger_1.logger.error({ err }, 'Error fetching pricing context for promo code calculation');
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                const { userTypeRules: promoUserRules, defaultRules: promoDefaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, false);
                const startDate = new Date(startTimeISO);
                const endDate = new Date(endTimeISO);
                const bookingMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
                const freeMinutes = Math.min(promotion.discount_value, promotion.max_free_minutes || promotion.discount_value, bookingMinutes);
                let discountAmount = 0;
                let minutesCounted = 0;
                let cursorTime = new Date(startDate);
                const freeEndTime = new Date(startDate.getTime() + freeMinutes * 60000);
                while (cursorTime < freeEndTime && minutesCounted < freeMinutes) {
                    const { localHour, dow } = (0, pricing_utils_1.localSlotInfo)(cursorTime, timezone);
                    const rule = (0, pricing_utils_1.findRuleForSlot)(promoUserRules, promoDefaultRules, localHour, dow);
                    const priceForSlot = rule.hourly_rate / 4;
                    discountAmount += priceForSlot;
                    minutesCounted += 15;
                    cursorTime = new Date(cursorTime.getTime() + 15 * 60000);
                }
                if (minutesCounted > freeMinutes) {
                    const ratio = freeMinutes / minutesCounted;
                    discountAmount = discountAmount * ratio;
                }
                discountAmount = Math.min(discountAmount, originalAmount);
                const finalAmount = Math.max(0, originalAmount - discountAmount);
                return {
                    promotionId: promotion.id,
                    promotionName: promotion.name,
                    discountType: promotion.discount_type,
                    discountAmount: Math.round(discountAmount * 100) / 100,
                    freeMinutes,
                    finalAmount: Math.round(finalAmount * 100) / 100,
                    originalAmount: originalAmount
                };
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error calculating discount for promo code');
                return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
            }
        });
    }
    /**
     * Assign a promotion code to a user
     */
    assignPromotionToUser(userId, promotionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('user_promotions')
                .insert({
                user_id: userId,
                promotion_id: promotionId
            });
            if (error) {
                // Check if it's a unique constraint violation (already assigned)
                if (error.code === '23505') {
                    throw new Error('This promotion has already been assigned to you');
                }
                logger_1.logger.error({ err: error }, 'Error assigning promotion');
                throw new Error('Failed to assign promotion');
            }
            return true;
        });
    }
    /**
     * Get a single promotion by ID
     */
    getPromotionById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .select('*')
                .eq('id', id)
                .single();
            if (error || !data)
                return null;
            return data;
        });
    }
    /**
     * Get all promotions (admin use), filtered by location
     */
    getAllPromotions(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = database_1.supabase
                .from('promotions')
                .select('*')
                .order('created_at', { ascending: false });
            if (locationId) {
                query = query.eq('location_id', locationId);
            }
            const { data, error } = yield query;
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching promotions');
                throw new Error('Failed to fetch promotions');
            }
            return data || [];
        });
    }
    /**
     * Create a new promotion
     */
    createPromotion(request) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const code = ((_a = request.code) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase()) || null;
            // Check code uniqueness within location if provided
            if (code) {
                const { data: existing } = yield database_1.supabase
                    .from('promotions')
                    .select('id')
                    .eq('location_id', request.locationId)
                    .ilike('code', code)
                    .limit(1);
                if (existing && existing.length > 0) {
                    throw new Error('A promotion with this code already exists at this location');
                }
            }
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .insert({
                location_id: request.locationId,
                name: request.name,
                code,
                description: request.description || null,
                discount_type: request.discountType,
                discount_value: request.discountValue,
                max_discount_amount: (_b = request.maxDiscountAmount) !== null && _b !== void 0 ? _b : null,
                min_booking_minutes: (_c = request.minBookingMinutes) !== null && _c !== void 0 ? _c : null,
                max_free_minutes: (_d = request.maxFreeMinutes) !== null && _d !== void 0 ? _d : null,
                is_auto_assigned: request.isAutoAssigned,
                is_single_use: request.isSingleUse,
                valid_from: request.validFrom || null,
                valid_to: request.validTo || null,
                is_active: true,
            })
                .select('*')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error creating promotion');
                throw new Error('Failed to create promotion');
            }
            logger_1.logger.info({ promotionId: data.id, name: data.name }, 'Promotion created');
            return data;
        });
    }
    /**
     * Update an existing promotion
     */
    updatePromotion(id, request) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Build the update payload (only include provided fields)
            const updateData = {};
            if (request.name !== undefined)
                updateData.name = request.name;
            if (request.description !== undefined)
                updateData.description = request.description;
            if (request.discountType !== undefined)
                updateData.discount_type = request.discountType;
            if (request.discountValue !== undefined)
                updateData.discount_value = request.discountValue;
            if (request.maxDiscountAmount !== undefined)
                updateData.max_discount_amount = request.maxDiscountAmount;
            if (request.minBookingMinutes !== undefined)
                updateData.min_booking_minutes = request.minBookingMinutes;
            if (request.maxFreeMinutes !== undefined)
                updateData.max_free_minutes = request.maxFreeMinutes;
            if (request.isAutoAssigned !== undefined)
                updateData.is_auto_assigned = request.isAutoAssigned;
            if (request.isSingleUse !== undefined)
                updateData.is_single_use = request.isSingleUse;
            if (request.validFrom !== undefined)
                updateData.valid_from = request.validFrom;
            if (request.validTo !== undefined)
                updateData.valid_to = request.validTo;
            if (request.isActive !== undefined)
                updateData.is_active = request.isActive;
            // Handle code change — check uniqueness
            if (request.code !== undefined) {
                const code = ((_a = request.code) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase()) || null;
                if (code) {
                    // Get the promotion's location_id first
                    const { data: promo } = yield database_1.supabase
                        .from('promotions')
                        .select('location_id')
                        .eq('id', id)
                        .single();
                    if (promo === null || promo === void 0 ? void 0 : promo.location_id) {
                        const { data: existing } = yield database_1.supabase
                            .from('promotions')
                            .select('id')
                            .eq('location_id', promo.location_id)
                            .ilike('code', code)
                            .neq('id', id)
                            .limit(1);
                        if (existing && existing.length > 0) {
                            throw new Error('A promotion with this code already exists at this location');
                        }
                    }
                }
                updateData.code = code;
            }
            updateData.updated_at = new Date().toISOString();
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .update(updateData)
                .eq('id', id)
                .select('*')
                .single();
            if (error) {
                logger_1.logger.error({ err: error, promotionId: id }, 'Error updating promotion');
                throw new Error('Failed to update promotion');
            }
            logger_1.logger.info({ promotionId: id }, 'Promotion updated');
            return data;
        });
    }
    /**
     * Soft-delete (deactivate) a promotion
     */
    deactivatePromotion(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select('id')
                .single();
            if (error || !data) {
                logger_1.logger.error({ err: error, promotionId: id }, 'Error deactivating promotion');
                throw new Error((error === null || error === void 0 ? void 0 : error.code) === 'PGRST116' ? 'Promotion not found' : 'Failed to deactivate promotion');
            }
            logger_1.logger.info({ promotionId: id }, 'Promotion deactivated');
        });
    }
    /**
     * Get usage stats for a promotion
     */
    getPromotionUsageStats(promotionId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get aggregated stats
            const { data: allRecords, error: statsError } = yield database_1.supabase
                .from('user_promotions')
                .select('id, redeemed_at, discount_applied')
                .eq('promotion_id', promotionId);
            if (statsError) {
                logger_1.logger.error({ err: statsError, promotionId }, 'Error fetching promotion usage stats');
                throw new Error('Failed to fetch usage stats');
            }
            const records = allRecords || [];
            const totalAssigned = records.length;
            const redeemed = records.filter(r => r.redeemed_at !== null);
            const totalRedeemed = redeemed.length;
            const totalDiscountGiven = redeemed.reduce((sum, r) => sum + (parseFloat(r.discount_applied) || 0), 0);
            // Get recent usage with user details (last 10 redeemed)
            const { data: recentData, error: recentError } = yield database_1.supabase
                .from('user_promotions')
                .select(`
        user_id,
        redeemed_at,
        discount_applied,
        free_minutes_applied,
        booking_id,
        user:user_profiles!user_id(full_name, email)
      `)
                .eq('promotion_id', promotionId)
                .not('redeemed_at', 'is', null)
                .order('redeemed_at', { ascending: false })
                .limit(10);
            if (recentError) {
                logger_1.logger.error({ err: recentError, promotionId }, 'Error fetching recent usage');
            }
            const recentUsage = (recentData || []).map((r) => {
                var _a, _b;
                return ({
                    userId: r.user_id,
                    fullName: ((_a = r.user) === null || _a === void 0 ? void 0 : _a.full_name) || 'Unknown',
                    email: ((_b = r.user) === null || _b === void 0 ? void 0 : _b.email) || '',
                    redeemedAt: r.redeemed_at,
                    discountApplied: r.discount_applied,
                    freeMinutesApplied: r.free_minutes_applied,
                    bookingId: r.booking_id,
                });
            });
            return {
                totalAssigned,
                totalRedeemed,
                totalDiscountGiven: Math.round(totalDiscountGiven * 100) / 100,
                recentUsage,
            };
        });
    }
}
exports.PromotionService = PromotionService;
// Export singleton instance
exports.promotionService = new PromotionService();
