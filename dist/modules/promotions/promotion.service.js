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
class PromotionService {
    /**
     * Get all available promotions for a user (unredeemed)
     */
    getUserAvailablePromotions(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('user_promotions')
                .select(`
        *,
        promotion:promotions(*)
      `)
                .eq('user_id', userId)
                .is('redeemed_at', null)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Error fetching user promotions:', error);
                throw new Error('Failed to fetch user promotions');
            }
            // Filter to only active and valid promotions
            const now = new Date().toISOString();
            const validPromotions = (data || []).filter((up) => {
                const promo = up.promotion;
                if (!promo || !promo.is_active)
                    return false;
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
     * Check if a user has the first booking free promotion available
     */
    hasFirstBookingPromo(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                return { available: false };
            }
            const { data, error } = yield database_1.supabase
                .from('user_promotions')
                .select(`
        *,
        promotion:promotions(*)
      `)
                .eq('user_id', userId)
                .is('redeemed_at', null)
                .limit(1);
            if (error || !data || data.length === 0) {
                return { available: false };
            }
            const userPromo = data[0];
            const promo = userPromo.promotion;
            // Validate the promotion is still valid
            const now = new Date().toISOString();
            if (!promo || !promo.is_active)
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
                console.error('Error calculating promotion discount:', error);
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
    calculateDiscountSimple(userId_1, bookingMinutes_1, originalAmount_1) {
        return __awaiter(this, arguments, void 0, function* (userId, bookingMinutes, originalAmount, hourlyRate = 60) {
            // Check if user has an available promotion
            const { available, promotion } = yield this.hasFirstBookingPromo(userId);
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
            // Check if user has an available promotion
            const { available, promotion } = yield this.hasFirstBookingPromo(userId);
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
                    console.error('Error fetching location for discount calculation:', locationError);
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                const timezone = location.timezone || 'America/New_York';
                // Convert date and time strings to ISO timestamps using location timezone
                const startTimeISO = (0, date_utils_1.createISOTimestamp)(date, startTime, timezone);
                const endTimeISO = (0, date_utils_1.createISOTimestamp)(date, endTime, timezone);
                // For non-free_minutes promotions, use simple calculation
                if (promotion.discount_type !== 'free_minutes') {
                    const bookingMinutes = Math.round((new Date(endTimeISO).getTime() - new Date(startTimeISO).getTime()) / 60000);
                    return this.calculateDiscountSimple(userId, bookingMinutes, originalAmount);
                }
                // Get pricing rules for this location
                const { data: rules, error: rulesError } = yield database_1.supabase
                    .from('pricing_rules')
                    .select('name, hourly_rate, start_time, end_time, days_of_week')
                    .eq('location_id', locationId)
                    .eq('is_active', true);
                if (rulesError || !rules || rules.length === 0) {
                    console.error('Error fetching pricing rules for discount calculation:', rulesError);
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                // Calculate the value of the first N free minutes using actual pricing
                const startDate = new Date(startTimeISO);
                const endDate = new Date(endTimeISO);
                const bookingMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
                // Determine how many minutes are free (capped at promotion limit and booking duration)
                const freeMinutes = Math.min(promotion.discount_value, promotion.max_free_minutes || promotion.discount_value, bookingMinutes);
                // Calculate the dollar value of the first freeMinutes of the booking
                let discountAmount = 0;
                let minutesCounted = 0;
                let cursorTime = new Date(startDate);
                const freeEndTime = new Date(startDate.getTime() + freeMinutes * 60000);
                while (cursorTime < freeEndTime && minutesCounted < freeMinutes) {
                    // Convert UTC time to local time for pricing rule determination
                    const localHour = parseInt(cursorTime.toLocaleString('en-US', {
                        hour: '2-digit',
                        hour12: false,
                        timeZone: timezone
                    }));
                    // Determine which rate applies based on LOCAL time
                    let rule;
                    if (localHour >= 9 || localHour < 2) {
                        // Standard Rate: 9am-2am (local time)
                        rule = rules.find(r => r.name === "Standard Rate");
                    }
                    else {
                        // Off-Peak Rate: 2am-9am (local time)
                        rule = rules.find(r => r.name === "Off-Peak Rate");
                    }
                    if (!rule) {
                        // Fallback to first available rule
                        rule = rules[0];
                    }
                    // Price for this 15-minute slot (in dollars)
                    const priceForSlot = rule.hourly_rate / 4;
                    discountAmount += priceForSlot;
                    minutesCounted += 15;
                    // Move to next 15-minute slot
                    cursorTime = new Date(cursorTime.getTime() + 15 * 60000);
                }
                // Adjust discount if we counted more than free minutes (due to 15-min increments)
                // e.g., if freeMinutes is 30 and we counted 30 minutes exactly, no adjustment needed
                // But if freeMinutes is 20 and we counted 30 minutes, we need to prorate
                if (minutesCounted > freeMinutes) {
                    const ratio = freeMinutes / minutesCounted;
                    discountAmount = discountAmount * ratio;
                }
                // Ensure discount doesn't exceed original amount
                discountAmount = Math.min(discountAmount, originalAmount);
                const finalAmount = Math.max(0, originalAmount - discountAmount);
                console.log(`Discount calculation: ${freeMinutes} free minutes = $${discountAmount.toFixed(2)} discount (original: $${originalAmount})`);
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
                console.error('Error calculating discount with pricing:', error);
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
                console.error('Error applying promotion to booking:', error);
                throw new Error('Failed to apply promotion');
            }
            console.log(`Applied promotion ${promotionId} to booking ${bookingId} for user ${userId}`);
            return true;
        });
    }
    /**
     * Get promotion by code (for manual entry)
     */
    getPromotionByCode(code) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!code) {
                return null;
            }
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .select('*')
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
                    console.error('Error fetching location for promo code calculation:', locationError);
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
                // For free_minutes promotions, calculate using pricing rules
                const { data: rules, error: rulesError } = yield database_1.supabase
                    .from('pricing_rules')
                    .select('name, hourly_rate, start_time, end_time, days_of_week')
                    .eq('location_id', locationId)
                    .eq('is_active', true);
                if (rulesError || !rules || rules.length === 0) {
                    console.error('Error fetching pricing rules for promo code calculation:', rulesError);
                    return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
                }
                const startDate = new Date(startTimeISO);
                const endDate = new Date(endTimeISO);
                const bookingMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
                // Determine how many minutes are free
                const freeMinutes = Math.min(promotion.discount_value, promotion.max_free_minutes || promotion.discount_value, bookingMinutes);
                // Calculate dollar value of free minutes using actual pricing
                let discountAmount = 0;
                let minutesCounted = 0;
                let cursorTime = new Date(startDate);
                const freeEndTime = new Date(startDate.getTime() + freeMinutes * 60000);
                while (cursorTime < freeEndTime && minutesCounted < freeMinutes) {
                    const localHour = parseInt(cursorTime.toLocaleString('en-US', {
                        hour: '2-digit',
                        hour12: false,
                        timeZone: timezone
                    }));
                    let rule;
                    if (localHour >= 9 || localHour < 2) {
                        rule = rules.find(r => r.name === "Standard Rate");
                    }
                    else {
                        rule = rules.find(r => r.name === "Off-Peak Rate");
                    }
                    if (!rule) {
                        rule = rules[0];
                    }
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
                console.error('Error calculating discount for promo code:', error);
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
                console.error('Error assigning promotion:', error);
                throw new Error('Failed to assign promotion');
            }
            return true;
        });
    }
    /**
     * Get all promotions (admin use)
     */
    getAllPromotions() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('promotions')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Error fetching promotions:', error);
                throw new Error('Failed to fetch promotions');
            }
            return data || [];
        });
    }
}
exports.PromotionService = PromotionService;
// Export singleton instance
exports.promotionService = new PromotionService();
