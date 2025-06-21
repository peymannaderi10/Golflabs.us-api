import { Router } from 'express';
import { PaymentController } from './payment.controller';

export const paymentRoutes = Router();

const controller = new PaymentController();

// Payment routes
paymentRoutes.post('/bookings/:bookingId/create-payment-intent', controller.createPaymentIntent);
paymentRoutes.post('/update-payment-intent', controller.updatePaymentIntent);
paymentRoutes.get('/payment-intent-status', controller.getPaymentIntentStatus);
paymentRoutes.post('/calculate-price', controller.calculatePrice); 