"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const stripe_webhooks_1 = require("./modules/payments/stripe.webhooks");
const email_webhooks_1 = require("./modules/email/email.webhooks");
const booking_routes_1 = require("./modules/bookings/booking.routes");
const payment_routes_1 = require("./modules/payments/payment.routes");
const pricing_routes_1 = require("./modules/pricing/pricing.routes");
const location_routes_1 = require("./modules/locations/location.routes");
const bay_routes_1 = require("./modules/bays/bay.routes");
const log_routes_1 = require("./modules/logs/log.routes");
const unlock_routes_1 = require("./modules/unlock/unlock.routes");
const user_routes_1 = require("./modules/user/user.routes");
const promotion_routes_1 = __importDefault(require("./modules/promotions/promotion.routes"));
const employee_1 = require("./modules/employee");
const league_routes_1 = require("./modules/leagues/league.routes");
const agreement_routes_1 = __importDefault(require("./modules/agreements/agreement.routes"));
const membership_routes_1 = require("./modules/memberships/membership.routes");
const marketing_routes_1 = require("./modules/marketing/marketing.routes");
const marketing_controller_1 = require("./modules/marketing/marketing.controller");
const booking_controller_1 = require("./modules/bookings/booking.controller");
const socket_service_1 = require("./modules/sockets/socket.service");
const auth_1 = require("./modules/auth");
const logger_1 = require("./shared/utils/logger");
const breach_monitor_1 = require("./shared/middleware/breach-monitor");
exports.app = (0, express_1.default)();
exports.httpServer = (0, http_1.createServer)(exports.app);
exports.app.set('trust proxy', 1);
const ALLOWED_ORIGINS = [
    (_a = process.env.FRONTEND_URL) === null || _a === void 0 ? void 0 : _a.replace(/\/$/, ''),
    'https://www.golflabs.us',
    'https://golflabs.us',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'] : []),
].filter(Boolean);
const io = new socket_io_1.Server(exports.httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});
// =====================================================
// SERVICES
// =====================================================
const socketService = new socket_service_1.SocketService(io);
socketService.init();
// =====================================================
// MIDDLEWARE
// =====================================================
// Security headers and HTTPS enforcement
exports.app.use((0, helmet_1.default)({
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
exports.app.use((0, cors_1.default)({
    origin: ALLOWED_ORIGINS,
    credentials: true,
}));
// Webhook rate limiting - separate from payment endpoints
const webhookRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute (Stripe can send many webhooks)
    message: { error: 'Too many webhook requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
// Webhook endpoints need raw body - must be before express.json()
exports.app.post('/stripe-webhook', webhookRateLimit, express_1.default.raw({ type: 'application/json' }), (req, res) => (0, stripe_webhooks_1.handleStripeWebhook)(req, res, socketService));
exports.app.post('/resend-webhook', express_1.default.raw({ type: 'application/json' }), email_webhooks_1.handleResendWebhook);
// Use json parser for all other routes
exports.app.use(express_1.default.json());
const globalRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
});
exports.app.use(globalRateLimit);
exports.app.use(breach_monitor_1.breachMonitor);
const LONG_RUNNING_PATHS = ['/employee/marketing/campaigns'];
exports.app.use((req, res, next) => {
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
exports.app.post('/validate-phone', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ valid: false, message: 'Phone number is required' });
    }
    const numverifyApiKey = process.env.NUMVERIFY_API_KEY;
    if (!numverifyApiKey) {
        // If API key is not configured, skip validation and allow signup
        logger_1.logger.warn('NumVerify API key not found - skipping phone validation');
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
        const response = yield fetch(numverifyUrl);
        const data = yield response.json();
        logger_1.logger.info({
            phone: phoneWithCountryCode,
            valid: data.valid,
            line_type: data.line_type,
            carrier: data.carrier,
        }, 'NumVerify response for phone validation');
        // Check for API errors - skip validation and allow signup if there's any API error
        // (rate limits, usage limits, inactive account, etc.)
        if (data.error) {
            logger_1.logger.warn({ apiError: data.error }, 'NumVerify API error - skipping phone validation');
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
    }
    catch (error) {
        // On any unexpected error (network issues, etc.), skip validation and allow signup
        logger_1.logger.warn({ err: error }, 'Error validating phone number - skipping validation');
        return res.json({
            valid: true,
            skipped: true,
            message: 'Phone validation skipped due to service unavailability'
        });
    }
}));
// =====================================================
// ROUTES
// =====================================================
// Create booking controller instance, now with socket service
const bookingController = new booking_controller_1.BookingController(socketService);
// Backwards compatibility: User-specific booking routes at root level
exports.app.get('/users/:userId/bookings/reserved', auth_1.authenticateUser, bookingController.getUserReservedBookings);
exports.app.get('/users/:userId/bookings/future', auth_1.authenticateUser, bookingController.getUserFutureBookings);
exports.app.get('/users/:userId/bookings/past', auth_1.authenticateUser, bookingController.getUserPastBookings);
exports.app.post('/bookings/:bookingId/cancel', auth_1.authenticateUser, bookingController.cancelBooking);
exports.app.post('/bookings/:bookingId/cancel-reservation', auth_1.authenticateUser, bookingController.cancelReservedBooking);
// Module routes
exports.app.use('/bookings', (0, booking_routes_1.createBookingRoutes)(socketService));
exports.app.use('/', payment_routes_1.paymentRoutes); // Payment routes are at root level for backwards compatibility
exports.app.use('/', pricing_routes_1.pricingRoutes); // Pricing routes are at root level for backwards compatibility
exports.app.use('/locations', location_routes_1.locationRoutes);
exports.app.use('/bays', (0, bay_routes_1.createBayRoutes)(socketService));
exports.app.use('/logs', log_routes_1.logRoutes);
exports.app.use('/', (0, unlock_routes_1.unlockRoutes)(socketService)); // Unlock routes at root level
exports.app.use('/', user_routes_1.userRoutes); // User routes at root level
exports.app.use('/promotions', promotion_routes_1.default); // Promotions routes
exports.app.use('/employee', employee_1.employeeRoutes); // Employee routes (reports, etc.)
exports.app.use('/leagues', (0, league_routes_1.createLeagueRoutes)(socketService)); // League ecosystem routes
exports.app.use('/team-invites', (0, league_routes_1.createTeamInviteRoutes)(socketService)); // Team invite routes (token-based)
exports.app.use('/attendance', (0, league_routes_1.createAttendanceRoutes)(socketService)); // Attendance confirmation routes (token-based)
exports.app.use('/agreements', agreement_routes_1.default); // Legal agreement tracking routes
exports.app.use('/memberships', membership_routes_1.membershipRoutes); // Membership subscription routes
exports.app.use('/employee/marketing', marketing_routes_1.marketingRoutes); // Marketing campaigns (employee-auth)
exports.app.get('/marketing/unsubscribe', (req, res) => marketing_controller_1.marketingController.unsubscribe(req, res)); // Public unsubscribe
// Health check endpoint
exports.app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Global error handler — must be last middleware
exports.app.use((err, _req, res, _next) => {
    logger_1.logger.error({ err }, 'Unhandled error');
    if (!res.headersSent) {
        res.status(500).json({ error: 'An internal error occurred' });
    }
});
