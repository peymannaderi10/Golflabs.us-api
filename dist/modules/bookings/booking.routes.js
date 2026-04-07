"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBookingRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const booking_controller_1 = require("./booking.controller");
const auth_1 = require("../auth");
const validation_1 = require("../../shared/middleware/validation");
const createBookingRoutes = (socketService) => {
    const bookingRoutes = (0, express_1.Router)();
    const controller = new booking_controller_1.BookingController(socketService);
    bookingRoutes.post('/reserve', auth_1.authenticateUser, (0, validation_1.validateUUID)('locationId', 'body'), (0, validation_1.validateUUID)('spaceId', 'body'), (0, express_validator_1.body)('startTime').notEmpty().withMessage('startTime is required'), (0, express_validator_1.body)('endTime').notEmpty().withMessage('endTime is required'), (0, express_validator_1.body)('date').notEmpty().withMessage('date is required'), (0, express_validator_1.body)('partySize').optional().isInt({ min: 1 }).withMessage('partySize must be an integer >= 1'), validation_1.handleValidationErrors, controller.reserveBooking);
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
