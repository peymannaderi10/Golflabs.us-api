"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBookingRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const booking_controller_1 = require("./booking.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
const guestReserveRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 guest reservations per IP per 15 min
    message: { error: 'Too many reservation attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const createBookingRoutes = (socketService) => {
    const bookingRoutes = (0, express_1.Router)();
    const controller = new booking_controller_1.BookingController(socketService);
    bookingRoutes.post('/reserve', auth_1.authenticateUser, (0, validation_1.validateUUID)('locationId', 'body'), (0, validation_1.validateUUID)('spaceId', 'body'), (0, express_validator_1.body)('startTime').notEmpty().withMessage('startTime is required'), (0, express_validator_1.body)('endTime').notEmpty().withMessage('endTime is required'), (0, express_validator_1.body)('date').notEmpty().withMessage('date is required'), (0, express_validator_1.body)('partySize').optional().isInt({ min: 1 }).withMessage('partySize must be an integer >= 1'), validation_1.handleValidationErrors, controller.reserveBooking);
    // Guest checkout: no auth required, rate-limited. Returns a Stripe client
    // secret — no booking row is created here; the booking is materialized by
    // the stripe webhook on payment success.
    bookingRoutes.post('/guest-checkout-session', guestReserveRateLimit, (0, validation_1.validateUUID)('locationId', 'body'), (0, validation_1.validateUUID)('spaceId', 'body'), (0, express_validator_1.body)('startTime').notEmpty().withMessage('startTime is required'), (0, express_validator_1.body)('endTime').notEmpty().withMessage('endTime is required'), (0, express_validator_1.body)('date').notEmpty().withMessage('date is required'), (0, express_validator_1.body)('guestEmail').isEmail().withMessage('Valid email is required'), (0, express_validator_1.body)('guestName').isString().notEmpty().withMessage('Name is required'), (0, express_validator_1.body)('guestPhone').isString().notEmpty().withMessage('Phone is required'), (0, express_validator_1.body)('partySize').optional().isInt({ min: 1 }), (0, express_validator_1.body)('documentHashes').isObject().withMessage('documentHashes must be an object'), (0, express_validator_1.body)('existingBookingId').optional({ nullable: true }).isUUID().withMessage('existingBookingId must be a UUID'), validation_1.handleValidationErrors, controller.createGuestCheckoutSession);
    // Guest reservation hold: claim the slot the moment the guest lands on
    // /guest-checkout so concurrent guests fail fast at form-submit time.
    // Returns nulls if the location has the hold feature off — frontend
    // noops in that case.
    bookingRoutes.post('/guest-reservation/init', guestReserveRateLimit, (0, validation_1.validateUUID)('locationId', 'body'), (0, validation_1.validateUUID)('spaceId', 'body'), (0, express_validator_1.body)('startTime').notEmpty(), (0, express_validator_1.body)('endTime').notEmpty(), (0, express_validator_1.body)('date').notEmpty(), (0, express_validator_1.body)('partySize').optional().isInt({ min: 1 }), validation_1.handleValidationErrors, controller.createGuestReservationHold);
    bookingRoutes.delete('/guest-reservation/:bookingId', guestReserveRateLimit, (0, validation_1.validateUUID)('bookingId', 'param'), validation_1.handleValidationErrors, controller.cancelGuestReservationHold);
    bookingRoutes.get('/', controller.getBookings);
    bookingRoutes.get('/capacity-holds', controller.getCapacityHolds);
    bookingRoutes.get('/capacity-holds/today', controller.getTodaysHold);
    bookingRoutes.get('/:bookingId/check-availability', auth_1.authenticateUser, (0, validation_1.validateUUID)('bookingId', 'param'), validation_1.handleValidationErrors, controller.checkAvailability);
    bookingRoutes.get('/:bookingId/extension-options', auth_1.authenticateKioskOrEmployee, (0, validation_1.validateUUID)('bookingId', 'param'), validation_1.handleValidationErrors, controller.getExtensionOptions);
    bookingRoutes.post('/:bookingId/extend', auth_1.authenticateKioskOrEmployee, (0, validation_1.validateUUID)('bookingId', 'param'), (0, express_validator_1.body)('extensionMinutes').isInt({ min: 15 }).withMessage('extensionMinutes must be an integer >= 15'), (0, express_validator_1.body)('useFreeMinutes').optional().isBoolean().withMessage('useFreeMinutes must be a boolean'), validation_1.handleValidationErrors, controller.extendBooking);
    // Employee-only routes. Every one goes through authenticate +
    // enforceLocationScope. Resource-param routes (`:bookingId`) resolve
    // locationId from the booking row before enforcement.
    const scopeBooking = [(0, auth_1.resolveResourceLocation)('bookings', 'bookingId'), auth_1.enforceLocationScope];
    bookingRoutes.get('/employee', auth_1.authenticateEmployee, auth_1.enforceLocationScope, controller.getEmployeeBookings);
    bookingRoutes.get('/employee/customers/search', auth_1.authenticateEmployee, auth_1.enforceLocationScope, controller.searchCustomers);
    bookingRoutes.post('/employee/create', auth_1.authenticateEmployee, auth_1.enforceLocationScope, (0, validation_1.validateUUID)('locationId', 'body'), (0, validation_1.validateUUID)('spaceId', 'body'), (0, express_validator_1.body)('startTime').notEmpty().withMessage('startTime is required'), (0, express_validator_1.body)('endTime').notEmpty().withMessage('endTime is required'), (0, express_validator_1.body)('date').notEmpty().withMessage('date is required'), validation_1.handleValidationErrors, controller.employeeCreateBooking);
    bookingRoutes.post('/employee/:bookingId/extend', auth_1.authenticateEmployee, (0, validation_1.validateUUID)('bookingId', 'param'), (0, express_validator_1.body)('extensionMinutes').isInt({ min: 15 }).withMessage('extensionMinutes must be an integer >= 15'), validation_1.handleValidationErrors, ...scopeBooking, controller.employeeExtendBooking);
    bookingRoutes.post('/employee/:bookingId/cancel', auth_1.authenticateEmployee, (0, validation_1.validateUUID)('bookingId', 'param'), validation_1.handleValidationErrors, ...scopeBooking, controller.employeeCancelBooking);
    bookingRoutes.post('/employee/:bookingId/reschedule', auth_1.authenticateEmployee, (0, validation_1.validateUUID)('bookingId', 'param'), (0, express_validator_1.body)('startTime').notEmpty().withMessage('startTime is required'), (0, express_validator_1.body)('endTime').notEmpty().withMessage('endTime is required'), (0, express_validator_1.body)('locationId').notEmpty().withMessage('locationId is required'), (0, express_validator_1.body)('spaceId').notEmpty().withMessage('spaceId is required'), validation_1.handleValidationErrors, ...scopeBooking, controller.employeeRescheduleBooking);
    return bookingRoutes;
};
exports.createBookingRoutes = createBookingRoutes;
// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 
