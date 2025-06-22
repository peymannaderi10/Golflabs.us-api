"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const stripe_webhooks_1 = require("./modules/payments/stripe.webhooks");
const email_webhooks_1 = require("./modules/email/email.webhooks");
const booking_routes_1 = require("./modules/bookings/booking.routes");
const payment_routes_1 = require("./modules/payments/payment.routes");
const pricing_routes_1 = require("./modules/pricing/pricing.routes");
const location_routes_1 = require("./modules/locations/location.routes");
const bay_routes_1 = require("./modules/bays/bay.routes");
const booking_controller_1 = require("./modules/bookings/booking.controller");
exports.app = (0, express_1.default)();
// =====================================================
// MIDDLEWARE
// =====================================================
// Use cors before the webhook route
exports.app.use((0, cors_1.default)());
// Webhook endpoints need raw body - must be before express.json()
exports.app.post('/stripe-webhook', express_1.default.raw({ type: 'application/json' }), stripe_webhooks_1.handleStripeWebhook);
exports.app.post('/resend-webhook', express_1.default.raw({ type: 'application/json' }), email_webhooks_1.handleResendWebhook);
// Use json parser for all other routes
exports.app.use(express_1.default.json());
// =====================================================
// ROUTES
// =====================================================
// Create booking controller instance for backwards compatibility routes
const bookingController = new booking_controller_1.BookingController();
// Backwards compatibility: User-specific booking routes at root level
exports.app.get('/users/:userId/bookings/reserved', bookingController.getUserReservedBookings);
exports.app.get('/users/:userId/bookings/future', bookingController.getUserFutureBookings);
exports.app.get('/users/:userId/bookings/past', bookingController.getUserPastBookings);
exports.app.post('/bookings/:bookingId/cancel', bookingController.cancelBooking);
// Module routes
exports.app.use('/bookings', booking_routes_1.bookingRoutes);
exports.app.use('/', payment_routes_1.paymentRoutes); // Payment routes are at root level for backwards compatibility
exports.app.use('/', pricing_routes_1.pricingRoutes); // Pricing routes are at root level for backwards compatibility
exports.app.use('/locations', location_routes_1.locationRoutes);
exports.app.use('/bays', bay_routes_1.bayRoutes);
// Health check endpoint
exports.app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
