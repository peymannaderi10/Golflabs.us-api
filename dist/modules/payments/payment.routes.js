"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = void 0;
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
exports.paymentRoutes = (0, express_1.Router)();
const controller = new payment_controller_1.PaymentController();
// Payment routes
exports.paymentRoutes.post('/bookings/:bookingId/create-payment-intent', controller.createPaymentIntent);
exports.paymentRoutes.post('/update-payment-intent', controller.updatePaymentIntent);
exports.paymentRoutes.get('/payment-intent-status', controller.getPaymentIntentStatus);
exports.paymentRoutes.post('/calculate-price', controller.calculatePrice);
