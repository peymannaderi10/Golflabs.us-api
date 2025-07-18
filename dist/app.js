"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
const booking_controller_1 = require("./modules/bookings/booking.controller");
const socket_service_1 = require("./modules/sockets/socket.service");
exports.app = (0, express_1.default)();
exports.httpServer = (0, http_1.createServer)(exports.app);
const io = new socket_io_1.Server(exports.httpServer, {
    cors: {
        origin: "*",
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
// Use cors before the webhook route
exports.app.use((0, cors_1.default)());
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
// =====================================================
// ROUTES
// =====================================================
// Create booking controller instance, now with socket service
const bookingController = new booking_controller_1.BookingController(socketService);
// Backwards compatibility: User-specific booking routes at root level
exports.app.get('/users/:userId/bookings/reserved', bookingController.getUserReservedBookings);
exports.app.get('/users/:userId/bookings/future', bookingController.getUserFutureBookings);
exports.app.get('/users/:userId/bookings/past', bookingController.getUserPastBookings);
exports.app.post('/bookings/:bookingId/cancel', bookingController.cancelBooking);
// Module routes
exports.app.use('/bookings', (0, booking_routes_1.createBookingRoutes)(socketService));
exports.app.use('/', payment_routes_1.paymentRoutes); // Payment routes are at root level for backwards compatibility
exports.app.use('/', pricing_routes_1.pricingRoutes); // Pricing routes are at root level for backwards compatibility
exports.app.use('/locations', location_routes_1.locationRoutes);
exports.app.use('/bays', bay_routes_1.bayRoutes);
exports.app.use('/logs', log_routes_1.logRoutes);
exports.app.use('/', (0, unlock_routes_1.unlockRoutes)(socketService)); // Unlock routes at root level
exports.app.use('/', user_routes_1.userRoutes); // User routes at root level
// Health check endpoint
exports.app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
