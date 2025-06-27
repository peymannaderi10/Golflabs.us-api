import express from 'express';
import cors from 'cors';
import { handleStripeWebhook } from './modules/payments/stripe.webhooks';
import { handleResendWebhook } from './modules/email/email.webhooks';
import { bookingRoutes } from './modules/bookings/booking.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { pricingRoutes } from './modules/pricing/pricing.routes';
import { locationRoutes } from './modules/locations/location.routes';
import { bayRoutes } from './modules/bays/bay.routes';
import { logRoutes } from './modules/logs/log.routes';
import { BookingController } from './modules/bookings/booking.controller';

export const app = express();

// =====================================================
// MIDDLEWARE
// =====================================================

// Use cors before the webhook route
app.use(cors());

// Webhook endpoints need raw body - must be before express.json()
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
app.post('/resend-webhook', express.raw({ type: 'application/json' }), handleResendWebhook);

// Use json parser for all other routes
app.use(express.json());

// =====================================================
// ROUTES
// =====================================================

// Create booking controller instance for backwards compatibility routes
const bookingController = new BookingController();

// Backwards compatibility: User-specific booking routes at root level
app.get('/users/:userId/bookings/reserved', bookingController.getUserReservedBookings);
app.get('/users/:userId/bookings/future', bookingController.getUserFutureBookings);
app.get('/users/:userId/bookings/past', bookingController.getUserPastBookings);
app.post('/bookings/:bookingId/cancel', bookingController.cancelBooking);

// Module routes
app.use('/bookings', bookingRoutes);
app.use('/', paymentRoutes); // Payment routes are at root level for backwards compatibility
app.use('/', pricingRoutes); // Pricing routes are at root level for backwards compatibility
app.use('/locations', locationRoutes);
app.use('/bays', bayRoutes);
app.use('/logs', logRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}); 