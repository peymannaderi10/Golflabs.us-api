import { Request, Response } from 'express';
import { promotionService } from './promotion.service';
import { logger } from '../../shared/utils/logger';

export class PromotionController {
  /**
   * GET /promotions/user/:userId
   * Get all available promotions for a user
   */
  async getUserPromotions(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const promotions = await promotionService.getUserAvailablePromotions(userId);
      return res.json({ promotions });
    } catch (error) {
      logger.error({ err: error }, 'Error getting user promotions');
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get promotions' 
      });
    }
  }

  /**
   * GET /promotions/user/:userId/first-booking
   * Check if user has the first booking free promotion
   */
  async checkFirstBookingPromo(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const result = await promotionService.hasFirstBookingPromo(userId);
      return res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Error checking first booking promo');
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to check promotion' 
      });
    }
  }

  /**
   * POST /promotions/calculate-discount
   * Calculate the discount for a potential booking
   * Accepts date and time strings, backend handles all conversion
   */
  async calculateDiscount(req: Request, res: Response) {
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

      const discount = await promotionService.calculateDiscountWithPricing({
        userId,
        locationId,
        date,
        startTime,
        endTime,
        originalAmount
      });

      return res.json(discount);
    } catch (error) {
      logger.error({ err: error }, 'Error calculating discount');
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to calculate discount' 
      });
    }
  }

  /**
   * POST /promotions/apply
   * Apply a promotion to a booking (called after payment success)
   */
  async applyPromotion(req: Request, res: Response) {
    try {
      const { userId, bookingId, promotionId, discountAmount, freeMinutes } = req.body;

      if (!userId || !bookingId || !promotionId) {
        return res.status(400).json({ 
          error: 'userId, bookingId, and promotionId are required' 
        });
      }

      const success = await promotionService.applyPromotion({
        userId,
        bookingId,
        promotionId,
        discountAmount: discountAmount || 0,
        freeMinutes
      });

      return res.json({ success });
    } catch (error) {
      logger.error({ err: error }, 'Error applying promotion');
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to apply promotion' 
      });
    }
  }

  /**
   * POST /promotions/redeem-code
   * Redeem a promotion code for a user (assigns permanently)
   */
  async redeemCode(req: Request, res: Response) {
    try {
      const { userId, code } = req.body;

      if (!userId || !code) {
        return res.status(400).json({ error: 'userId and code are required' });
      }

      // Find the promotion by code
      const promotion = await promotionService.getPromotionByCode(code);
      
      if (!promotion) {
        return res.status(404).json({ error: 'Invalid or expired promotion code' });
      }

      // Assign to user
      await promotionService.assignPromotionToUser(userId, promotion.id);

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
    } catch (error) {
      logger.error({ err: error }, 'Error redeeming promotion code');
      return res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to redeem code' 
      });
    }
  }

  /**
   * POST /promotions/validate-code
   * Validate a promo code and calculate the discount for the current booking
   * Does NOT assign the code to the user - just calculates what the discount would be
   */
  async validateCode(req: Request, res: Response) {
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
      const promotion = await promotionService.getPromotionByCode(code);
      
      if (!promotion) {
        return res.status(404).json({ error: 'Invalid or expired promo code' });
      }

      // Calculate the discount this code would give
      const discount = await promotionService.calculateDiscountForPromotion(
        promotion,
        locationId,
        date,
        startTime,
        endTime,
        originalAmount
      );

      return res.json(discount);
    } catch (error) {
      logger.error({ err: error }, 'Error validating promo code');
      return res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to validate code' 
      });
    }
  }

  /**
   * GET /promotions
   * Get all promotions (admin)
   */
  async getAllPromotions(req: Request, res: Response) {
    try {
      const promotions = await promotionService.getAllPromotions();
      return res.json({ promotions });
    } catch (error) {
      logger.error({ err: error }, 'Error getting all promotions');
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get promotions' 
      });
    }
  }
}

export const promotionController = new PromotionController();

