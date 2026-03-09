import { supabase } from '../../config/database';
import { createISOTimestamp } from '../../shared/utils/date.utils';
import { logger } from '../../shared/utils/logger';
import { fetchPricingContext, splitRules, findRuleForSlot, localSlotInfo } from '../../shared/utils/pricing.utils';
import { 
  Promotion, 
  UserPromotion, 
  CalculatedDiscount, 
  ApplyPromotionRequest,
  CheckDiscountRequest,
  CheckDiscountWithTimesRequest
} from './promotion.types';

export class PromotionService {
  /**
   * Get all available promotions for a user (unredeemed)
   */
  async getUserAvailablePromotions(userId: string): Promise<UserPromotion[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const { data, error } = await supabase
      .from('user_promotions')
      .select(`
        *,
        promotion:promotions(*)
      `)
      .eq('user_id', userId)
      .is('redeemed_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching user promotions');
      throw new Error('Failed to fetch user promotions');
    }

    // Filter to only active and valid promotions
    const now = new Date().toISOString();
    const validPromotions = (data || []).filter((up: any) => {
      const promo = up.promotion;
      if (!promo || !promo.is_active) return false;
      if (promo.valid_from && promo.valid_from > now) return false;
      if (promo.valid_to && promo.valid_to < now) return false;
      if (up.expires_at && up.expires_at < now) return false;
      return true;
    });

    return validPromotions;
  }

  /**
   * Check if a user has the first booking free promotion available
   */
  async hasFirstBookingPromo(userId: string): Promise<{ available: boolean; promotion?: Promotion }> {
    if (!userId) {
      return { available: false };
    }

    const { data, error } = await supabase
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

    const userPromo = data[0] as any;
    const promo = userPromo.promotion;

    // Validate the promotion is still valid
    const now = new Date().toISOString();
    if (!promo || !promo.is_active) return { available: false };
    if (promo.valid_from && promo.valid_from > now) return { available: false };
    if (promo.valid_to && promo.valid_to < now) return { available: false };
    if (userPromo.expires_at && userPromo.expires_at < now) return { available: false };

    return { 
      available: true, 
      promotion: promo 
    };
  }

  /**
   * Calculate the discount for a booking using the database function
   */
  async calculateDiscount(request: CheckDiscountRequest): Promise<CalculatedDiscount> {
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
    const { data, error } = await supabase.rpc('calculate_promotion_discount', {
      p_user_id: userId,
      p_booking_minutes: bookingMinutes,
      p_original_amount: originalAmount,
      p_hourly_rate: hourlyRate || null
    });

    if (error) {
      logger.error({ err: error }, 'Error calculating promotion discount');
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
    const result = data?.[0];
    
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
  }

  /**
   * Calculate discount without using the database function (for when user isn't in DB yet)
   * This is a simpler version that assumes the first-booking-free promotion
   */
  async calculateDiscountSimple(
    userId: string, 
    bookingMinutes: number, 
    originalAmount: number,
    hourlyRate: number = 60
  ): Promise<CalculatedDiscount> {
    // Check if user has an available promotion
    const { available, promotion } = await this.hasFirstBookingPromo(userId);

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
        freeMinutes = Math.min(
          promotion.discount_value,
          promotion.max_free_minutes || promotion.discount_value,
          bookingMinutes
        );
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
  }

  /**
   * Calculate discount using actual booking times and pricing rules
   * This ensures correct discount calculation even when bookings span multiple pricing periods
   */
  async calculateDiscountWithPricing(request: CheckDiscountWithTimesRequest): Promise<CalculatedDiscount> {
    const { userId, locationId, date, startTime, endTime, originalAmount } = request;

    // Check if user has an available promotion
    const { available, promotion } = await this.hasFirstBookingPromo(userId);

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
      const { data: location, error: locationError } = await supabase
        .from('locations')
        .select('timezone')
        .eq('id', locationId)
        .single();

      if (locationError || !location) {
        logger.error({ err: locationError }, 'Error fetching location for discount calculation');
        return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
      }

      const timezone = location.timezone || 'America/New_York';

      // Convert date and time strings to ISO timestamps using location timezone
      const startTimeISO = createISOTimestamp(date, startTime, timezone);
      const endTimeISO = createISOTimestamp(date, endTime, timezone);

      // For non-free_minutes promotions, use simple calculation
      if (promotion.discount_type !== 'free_minutes') {
        const bookingMinutes = Math.round((new Date(endTimeISO).getTime() - new Date(startTimeISO).getTime()) / 60000);
        return this.calculateDiscountSimple(userId, bookingMinutes, originalAmount);
      }

      // Use shared pricing context for user-type-aware discount calculation
      let ctx;
      try {
        ctx = await fetchPricingContext(locationId, userId);
      } catch (err) {
        logger.error({ err }, 'Error fetching pricing context for discount calculation');
        return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
      }
      const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, false);

      const startDate = new Date(startTimeISO);
      const endDate = new Date(endTimeISO);
      const bookingMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

      const freeMinutes = Math.min(
        promotion.discount_value,
        promotion.max_free_minutes || promotion.discount_value,
        bookingMinutes
      );

      let discountAmount = 0;
      let minutesCounted = 0;
      let cursorTime = new Date(startDate);
      const freeEndTime = new Date(startDate.getTime() + freeMinutes * 60000);

      while (cursorTime < freeEndTime && minutesCounted < freeMinutes) {
        const { localHour, dow } = localSlotInfo(cursorTime, timezone);
        const rule = findRuleForSlot(userTypeRules, defaultRules, localHour, dow);
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

      logger.info({ freeMinutes, discountAmount: discountAmount.toFixed(2), originalAmount }, 'Discount calculation complete');

      return {
        promotionId: promotion.id,
        promotionName: promotion.name,
        discountType: promotion.discount_type,
        discountAmount: Math.round(discountAmount * 100) / 100,
        freeMinutes,
        finalAmount: Math.round(finalAmount * 100) / 100,
        originalAmount: originalAmount
      };

    } catch (error) {
      logger.error({ err: error }, 'Error calculating discount with pricing');
      return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
    }
  }

  /**
   * Fallback discount calculation when pricing rules can't be fetched
   * Estimates hourly rate from the total booking price
   */
  private fallbackDiscountCalculation(
    promotion: Promotion,
    date: string,
    startTime: string,
    endTime: string,
    originalAmount: number
  ): CalculatedDiscount {
    // Parse time strings to calculate duration
    const parseTime = (timeStr: string): number => {
      const [time, period] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
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
    
    const freeMinutes = Math.min(
      promotion.discount_value,
      promotion.max_free_minutes || promotion.discount_value,
      bookingMinutes
    );
    
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
  async applyPromotion(request: ApplyPromotionRequest): Promise<boolean> {
    const { userId, bookingId, promotionId, discountAmount, freeMinutes } = request;

    // Use the database function for atomic operation
    const { error } = await supabase.rpc('apply_promotion_to_booking', {
      p_user_id: userId,
      p_booking_id: bookingId,
      p_promotion_id: promotionId,
      p_discount_amount: discountAmount,
      p_free_minutes: freeMinutes || null
    });

    if (error) {
      logger.error({ err: error }, 'Error applying promotion to booking');
      throw new Error('Failed to apply promotion');
    }

    logger.info({ promotionId, bookingId, userId }, 'Applied promotion to booking');
    return true;
  }

  /**
   * Get promotion by code (for manual entry)
   */
  async getPromotionByCode(code: string): Promise<Promotion | null> {
    if (!code) {
      return null;
    }

    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .ilike('code', code.trim())  // Case-insensitive match
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    // Validate dates
    const now = new Date().toISOString();
    if (data.valid_from && data.valid_from > now) return null;
    if (data.valid_to && data.valid_to < now) return null;

    return data;
  }

  /**
   * Calculate discount for a specific promotion (used for promo code validation)
   * This calculates what discount a promotion would give without checking user eligibility
   */
  async calculateDiscountForPromotion(
    promotion: Promotion,
    locationId: string,
    date: string,
    startTime: string,
    endTime: string,
    originalAmount: number
  ): Promise<CalculatedDiscount> {
    try {
      // Get location timezone
      const { data: location, error: locationError } = await supabase
        .from('locations')
        .select('timezone')
        .eq('id', locationId)
        .single();

      if (locationError || !location) {
        logger.error({ err: locationError }, 'Error fetching location for promo code calculation');
        return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
      }

      const timezone = location.timezone || 'America/New_York';

      // Convert date and time strings to ISO timestamps
      const startTimeISO = createISOTimestamp(date, startTime, timezone);
      const endTimeISO = createISOTimestamp(date, endTime, timezone);

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
        ctx = await fetchPricingContext(locationId);
      } catch (err) {
        logger.error({ err }, 'Error fetching pricing context for promo code calculation');
        return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
      }
      const { userTypeRules: promoUserRules, defaultRules: promoDefaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, false);

      const startDate = new Date(startTimeISO);
      const endDate = new Date(endTimeISO);
      const bookingMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

      const freeMinutes = Math.min(
        promotion.discount_value,
        promotion.max_free_minutes || promotion.discount_value,
        bookingMinutes
      );

      let discountAmount = 0;
      let minutesCounted = 0;
      let cursorTime = new Date(startDate);
      const freeEndTime = new Date(startDate.getTime() + freeMinutes * 60000);

      while (cursorTime < freeEndTime && minutesCounted < freeMinutes) {
        const { localHour, dow } = localSlotInfo(cursorTime, timezone);
        const rule = findRuleForSlot(promoUserRules, promoDefaultRules, localHour, dow);
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

    } catch (error) {
      logger.error({ err: error }, 'Error calculating discount for promo code');
      return this.fallbackDiscountCalculation(promotion, date, startTime, endTime, originalAmount);
    }
  }

  /**
   * Assign a promotion code to a user
   */
  async assignPromotionToUser(userId: string, promotionId: string): Promise<boolean> {
    const { error } = await supabase
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
      logger.error({ err: error }, 'Error assigning promotion');
      throw new Error('Failed to assign promotion');
    }

    return true;
  }

  /**
   * Get all promotions (admin use)
   */
  async getAllPromotions(): Promise<Promotion[]> {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching promotions');
      throw new Error('Failed to fetch promotions');
    }

    return data || [];
  }
}

// Export singleton instance
export const promotionService = new PromotionService();

