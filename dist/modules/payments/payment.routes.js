"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_validator_1 = require("express-validator");
const payment_controller_1 = require("./payment.controller");
const validation_1 = require("../../shared/middleware/validation");
exports.paymentRoutes = (0, express_1.Router)();
const controller = new payment_controller_1.PaymentController();
const paymentRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many payment requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
// Payment routes with validation and rate limiting
exports.paymentRoutes.post('/bookings/:bookingId/create-payment-intent', paymentRateLimit, (0, express_validator_1.param)('bookingId').isUUID().withMessage('Booking ID must be a valid UUID'), (0, express_validator_1.body)('amount').isInt({ min: 0 }).withMessage('Amount must be a non-negative integer'), validation_1.handleValidationErrors, controller.createPaymentIntent);
exports.paymentRoutes.post('/update-payment-intent', paymentRateLimit, (0, express_validator_1.body)('paymentIntentId').matches(/^pi_[a-zA-Z0-9_]+$/).withMessage('Invalid payment intent ID format'), (0, express_validator_1.body)('email').optional().isEmail().withMessage('Invalid email format'), (0, express_validator_1.body)('firstName').optional().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'), (0, express_validator_1.body)('lastName').optional().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'), (0, express_validator_1.body)('phone').optional().matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone format'), validation_1.handleValidationErrors, controller.updatePaymentIntent);
exports.paymentRoutes.get('/payment-intent-status', paymentRateLimit, (0, express_validator_1.query)('payment_intent').matches(/^pi_[a-zA-Z0-9_]+$/).withMessage('Invalid payment intent ID format'), validation_1.handleValidationErrors, controller.getPaymentIntentStatus);
exports.paymentRoutes.get('/setup-intent-status', paymentRateLimit, (0, express_validator_1.query)('setup_intent').matches(/^seti_[a-zA-Z0-9_]+$/).withMessage('Invalid setup intent ID format'), validation_1.handleValidationErrors, controller.getSetupIntentStatus);
exports.paymentRoutes.post('/calculate-price', (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 200, // 200 requests per 5 minutes (less restrictive as this is used more frequently)
    message: { error: 'Too many price calculation requests, please try again later.' }
}), (0, express_validator_1.body)('locationId').isUUID().withMessage('Location ID must be a valid UUID'), (0, express_validator_1.body)('startTime').isISO8601().withMessage('Start time must be a valid ISO 8601 date'), (0, express_validator_1.body)('endTime').isISO8601().withMessage('End time must be a valid ISO 8601 date'), validation_1.handleValidationErrors, controller.calculatePrice);
