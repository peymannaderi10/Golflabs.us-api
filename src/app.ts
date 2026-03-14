import express, { Request, Response, NextFunction } from 'express';
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
import { createBayRoutes } from './modules/bays/bay.routes';
import { logRoutes } from './modules/logs/log.routes';
import { unlockRoutes } from './modules/unlock/unlock.routes';
import { createUserRoutes } from './modules/user/user.routes';
import promotionRoutes from './modules/promotions/promotion.routes';
import { employeeRoutes } from './modules/employee';
import { createLeagueRoutes, createTeamInviteRoutes, createAttendanceRoutes } from './modules/leagues/league.routes';
import agreementRoutes from './modules/agreements/agreement.routes';
import { membershipRoutes } from './modules/memberships/membership.routes';
import { marketingRoutes } from './modules/marketing/marketing.routes';
import { marketingController } from './modules/marketing/marketing.controller';
import { BookingController } from './modules/bookings/booking.controller';
import { SocketService } from './modules/sockets/socket.service';
import { authenticateUser } from './modules/auth';
import { logger } from './shared/utils/logger';
import { breachMonitor } from './shared/middleware/breach-monitor';

export const app = express();
export const httpServer = createServer(app);

app.set('trust proxy', 1);

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL?.replace(/\/$/, ''),
  'https://www.golflabs.us',
  'https://golflabs.us',
  'https://app.golflabs.us',
  'https://www.app.golflabs.us',
  'https://golflabs-landing.vercel.app',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080', 'http://localhost:3001'] : []),
].filter(Boolean) as string[];

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
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

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

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

const globalRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
});
app.use(globalRateLimit);
app.use(breachMonitor);

const LONG_RUNNING_PATHS = ['/employee/marketing/campaigns'];

app.use((req, res, next) => {
  const isLongRunning = LONG_RUNNING_PATHS.some((p) => req.path.startsWith(p) && req.method === 'POST');
  const timeout = isLongRunning ? 120000 : 30000;
  req.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// =====================================================
// PHONE VALIDATION
// =====================================================

// Endpoint to validate phone number using NumVerify API
app.post('/validate-phone', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ valid: false, message: 'Phone number is required' });
  }

  const numverifyApiKey = process.env.NUMVERIFY_API_KEY;
  if (!numverifyApiKey) {
    // If API key is not configured, skip validation and allow signup
    logger.warn('NumVerify API key not found - skipping phone validation');
    return res.json({ valid: true, skipped: true, message: 'Phone validation skipped - not configured' });
  }

  try {
    // Strip any non-numeric characters from the phone number
    const cleanedPhone = phone.replace(/\D/g, '');

    // Basic validation: US phone numbers should be 10 digits (without country code) or 11 digits (with country code)
    if (cleanedPhone.length < 10 || cleanedPhone.length > 11) {
      return res.json({
        valid: false,
        message: 'Please enter a valid 10-digit US phone number'
      });
    }

    // Add US country code (1) if not already present
    const phoneWithCountryCode = cleanedPhone.startsWith('1') ? cleanedPhone : `1${cleanedPhone}`;

    // Call NumVerify API
    const numverifyUrl = `http://apilayer.net/api/validate?access_key=${numverifyApiKey}&number=${phoneWithCountryCode}`;

    const response = await fetch(numverifyUrl);
    const data = await response.json();

    logger.info({
      phone: phoneWithCountryCode,
      valid: data.valid,
      line_type: data.line_type,
      carrier: data.carrier,
    }, 'NumVerify response for phone validation');

    // Check for API errors - skip validation and allow signup if there's any API error
    // (rate limits, usage limits, inactive account, etc.)
    if (data.error) {
      logger.warn({ apiError: data.error }, 'NumVerify API error - skipping phone validation');
      return res.json({
        valid: true,
        skipped: true,
        message: 'Phone validation skipped due to service unavailability'
      });
    }

    // Only block if API explicitly returns valid: false (truly invalid phone number)
    if (data.valid === false) {
      return res.json({
        valid: false,
        message: 'Please enter a valid US phone number'
      });
    }

    return res.json({
      valid: true,
      carrier: data.carrier,
      line_type: data.line_type,
      location: data.location
    });

  } catch (error: any) {
    // On any unexpected error (network issues, etc.), skip validation and allow signup
    logger.warn({ err: error }, 'Error validating phone number - skipping validation');
    return res.json({
      valid: true,
      skipped: true,
      message: 'Phone validation skipped due to service unavailability'
    });
  }
});

// =====================================================
// ROUTES
// =====================================================

// Create booking controller instance, now with socket service
const bookingController = new BookingController(socketService);

// Backwards compatibility: User-specific booking routes at root level
app.get('/users/:userId/bookings/reserved', authenticateUser, bookingController.getUserReservedBookings);
app.get('/users/:userId/bookings/future', authenticateUser, bookingController.getUserFutureBookings);
app.get('/users/:userId/bookings/past', authenticateUser, bookingController.getUserPastBookings);
app.post('/bookings/:bookingId/cancel', authenticateUser, bookingController.cancelBooking);
app.post('/bookings/:bookingId/cancel-reservation', authenticateUser, bookingController.cancelReservedBooking);

// Module routes
app.use('/bookings', createBookingRoutes(socketService));
app.use('/', paymentRoutes); // Payment routes are at root level for backwards compatibility
app.use('/', pricingRoutes); // Pricing routes are at root level for backwards compatibility
app.use('/locations', locationRoutes);
app.use('/bays', createBayRoutes(socketService));
app.use('/logs', logRoutes);
app.use('/', unlockRoutes(socketService)); // Unlock routes at root level
app.use('/', createUserRoutes(socketService)); // User routes at root level
app.use('/promotions', promotionRoutes); // Promotions routes
app.use('/employee', employeeRoutes); // Employee routes (reports, etc.)
app.use('/leagues', createLeagueRoutes(socketService)); // League ecosystem routes
app.use('/team-invites', createTeamInviteRoutes(socketService)); // Team invite routes (token-based)
app.use('/attendance', createAttendanceRoutes(socketService)); // Attendance confirmation routes (token-based)
app.use('/agreements', agreementRoutes); // Legal agreement tracking routes
app.use('/memberships', membershipRoutes); // Membership subscription routes
app.use('/employee/marketing', marketingRoutes); // Marketing campaigns (employee-auth)
app.get('/marketing/unsubscribe', (req, res) => marketingController.unsubscribe(req, res)); // Public unsubscribe

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler — must be last middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'An internal error occurred' });
  }
}); 