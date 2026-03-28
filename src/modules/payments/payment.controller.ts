import { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { logger } from '../../shared/utils/logger';

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  createPaymentIntent = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const authenticatedUserId = (req as AuthenticatedRequest).user!.id;
      const { promotionId, membershipId, memberFreeMinutesApplied } = req.body;

      const promotionInfo = promotionId ? { promotionId } : undefined;

      const memberPricingInfo = membershipId ? {
        membershipId,
        freeMinutesApplied: memberFreeMinutesApplied || 0,
      } : undefined;

      const result = await this.paymentService.createPaymentIntent(bookingId, authenticatedUserId, promotionInfo, memberPricingInfo);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in create-payment-intent');
      if (error.message === 'Booking not found.') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('cannot be paid for')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message === 'Booking reservation has expired.') {
        return res.status(410).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  };

  updatePaymentIntent = async (req: Request, res: Response) => {
    try {
      const result = await this.paymentService.updatePaymentIntent(req.body);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating payment intent');
      res.status(500).json({ 
        error: 'Failed to update payment intent',
        details: error.message
      });
    }
  };

  getPaymentIntentStatus = async (req: Request, res: Response) => {
    try {
      const paymentIntentId = req.query.payment_intent as string;
      const result = await this.paymentService.getPaymentIntentStatus(paymentIntentId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error retrieving payment intent');
      if (error.message === "Payment Intent ID is required") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to retrieve payment intent status" });
    }
  };

  getSetupIntentStatus = async (req: Request, res: Response) => {
    try {
      const setupIntentId = req.query.setup_intent as string;
      const result = await this.paymentService.getSetupIntentStatus(setupIntentId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error retrieving setup intent');
      if (error.message === 'Setup Intent ID is required') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to retrieve setup intent status' });
    }
  };

  calculatePrice = async (req: Request, res: Response) => {
    try {
      const { locationId, startTime, endTime, userId } = req.body;
      const result = await this.paymentService.calculatePrice(locationId, startTime, endTime, userId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in calculate-price');
      if (error.message.includes('required')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('Invalid')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('No pricing rules found')) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to calculate price', details: error.message });
    }
  };
} 