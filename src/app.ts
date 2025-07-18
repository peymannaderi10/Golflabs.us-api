import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { handleStripeWebhook } from './modules/payments/stripe.webhooks';
import { handleResendWebhook } from './modules/email/email.webhooks';
import { createBookingRoutes } from './modules/bookings/booking.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { pricingRoutes } from './modules/pricing/pricing.routes';
import { locationRoutes } from './modules/locations/location.routes';
import { bayRoutes } from './modules/bays/bay.routes';
import { logRoutes } from './modules/logs/log.routes';
import { unlockRoutes } from './modules/unlock/unlock.routes';
import { userRoutes } from './modules/user/user.routes';
import { BookingController } from './modules/bookings/booking.controller';
import { SocketService } from './modules/sockets/socket.service';

export const app = express();
export const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// =====================================================
// SERVICES
// =====================================================
const socketService = new SocketService(io);
socketService.init();

// =====================================================
// MIDDLEWARE
// =====================================================

// Security headers and HTTPS enforcement
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Use cors before the webhook route
app.use(cors());

// Webhook rate limiting - separate from payment endpoints
const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute (Stripe can send many webhooks)
  message: { error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook endpoints need raw body - must be before express.json()
app.post('/stripe-webhook', webhookRateLimit, express.raw({ type: 'application/json' }), (req, res) => handleStripeWebhook(req, res, socketService));
app.post('/resend-webhook', express.raw({ type: 'application/json' }), handleResendWebhook);

// Use json parser for all other routes
app.use(express.json());

// =====================================================
// ROUTES
// =====================================================

// Create booking controller instance, now with socket service
const bookingController = new BookingController(socketService);

// Backwards compatibility: User-specific booking routes at root level
app.get('/users/:userId/bookings/reserved', bookingController.getUserReservedBookings);
app.get('/users/:userId/bookings/future', bookingController.getUserFutureBookings);
app.get('/users/:userId/bookings/past', bookingController.getUserPastBookings);
app.post('/bookings/:bookingId/cancel', bookingController.cancelBooking);

// Module routes
app.use('/bookings', createBookingRoutes(socketService));
app.use('/', paymentRoutes); // Payment routes are at root level for backwards compatibility
app.use('/', pricingRoutes); // Pricing routes are at root level for backwards compatibility
app.use('/locations', locationRoutes);
app.use('/bays', bayRoutes);
app.use('/logs', logRoutes);
app.use('/', unlockRoutes(socketService)); // Unlock routes at root level
app.use('/', userRoutes); // User routes at root level

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}); 