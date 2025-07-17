import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import { PaymentController } from './payment.controller';

export const paymentRoutes = Router();

const controller = new PaymentController();

// Rate limiting for payment endpoints - more restrictive than general API
const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes per IP
  message: {
    error: 'Too many payment requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware
const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Invalid input',
      details: errors.array()
    });
  }
  next();
};

// Payment routes with validation and rate limiting
paymentRoutes.post('/bookings/:bookingId/create-payment-intent', 
  paymentRateLimit,
  param('bookingId').isUUID().withMessage('Booking ID must be a valid UUID'),
  body('amount').isInt({ min: 50 }).withMessage('Amount must be at least 50 cents'),
  handleValidationErrors,
  controller.createPaymentIntent
);

paymentRoutes.post('/update-payment-intent', 
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

paymentRoutes.post('/calculate-price', 
  rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 requests per 5 minutes (less restrictive as this is used more frequently)
    message: { error: 'Too many price calculation requests, please try again later.' }
  }),
  body('locationId').isUUID().withMessage('Location ID must be a valid UUID'),
  body('startTime').isISO8601().withMessage('Start time must be a valid ISO 8601 date'),
  body('endTime').isISO8601().withMessage('End time must be a valid ISO 8601 date'),
  handleValidationErrors,
  controller.calculatePrice
); 