import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query } from 'express-validator';
import { PaymentController } from './payment.controller';
import { authenticateUser } from '../auth';
import { handleValidationErrors } from '../../shared/middleware/validation';

export const paymentRoutes = Router();

const controller = new PaymentController();

const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many payment requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Payment routes with validation and rate limiting
paymentRoutes.post('/bookings/:bookingId/create-payment-intent',
  authenticateUser,
  paymentRateLimit,
  param('bookingId').isUUID().withMessage('Booking ID must be a valid UUID'),
  handleValidationErrors,
  controller.createPaymentIntent
);

paymentRoutes.post('/update-payment-intent',
  authenticateUser,
  paymentRateLimit,
  body('paymentIntentId').matches(/^pi_[a-zA-Z0-9_]+$/).withMessage('Invalid payment intent ID format'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('firstName').optional().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
  body('lastName').optional().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
  body('phone').optional().matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone format'),
  handleValidationErrors,
  controller.updatePaymentIntent
);

paymentRoutes.get('/payment-intent-status', 
  paymentRateLimit,
  query('payment_intent').matches(/^pi_[a-zA-Z0-9_]+$/).withMessage('Invalid payment intent ID format'),
  handleValidationErrors,
  controller.getPaymentIntentStatus
);

paymentRoutes.get('/setup-intent-status',
  paymentRateLimit,
  query('setup_intent').matches(/^seti_[a-zA-Z0-9_]+$/).withMessage('Invalid setup intent ID format'),
  handleValidationErrors,
  controller.getSetupIntentStatus
);

paymentRoutes.post('/calculate-price', 
  rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 200, // 200 requests per 5 minutes (less restrictive as this is used more frequently)
    message: { error: 'Too many price calculation requests, please try again later.' }
  }),
  body('locationId').isUUID().withMessage('Location ID must be a valid UUID'),
  body('startTime').isISO8601().withMessage('Start time must be a valid ISO 8601 date'),
  body('endTime').isISO8601().withMessage('End time must be a valid ISO 8601 date'),
  handleValidationErrors,
  controller.calculatePrice
); 