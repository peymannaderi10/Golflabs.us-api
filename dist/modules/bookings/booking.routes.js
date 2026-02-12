"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBookingRoutes = void 0;
const express_1 = require("express");
const booking_controller_1 = require("./booking.controller");
const employee_middleware_1 = require("./employee.middleware");
const createBookingRoutes = (socketService) => {
    const bookingRoutes = (0, express_1.Router)();
    const controller = new booking_controller_1.BookingController(socketService);
    // Booking management routes
    bookingRoutes.post('/reserve', controller.reserveBooking);
    bookingRoutes.get('/', controller.getBookings);
    // Capacity holds (public, no auth - needed by booking page)
    bookingRoutes.get('/capacity-holds', controller.getCapacityHolds);
    bookingRoutes.get('/capacity-holds/today', controller.getTodaysHold);
    // Session extension routes (called by kiosk - no auth required)
    bookingRoutes.get('/:bookingId/extension-options', controller.getExtensionOptions);
    bookingRoutes.post('/:bookingId/extend', controller.extendBooking);
    // Employee-only routes
    bookingRoutes.get('/employee', employee_middleware_1.authenticateEmployee, controller.getEmployeeBookings);
    bookingRoutes.get('/employee/customers/search', employee_middleware_1.authenticateEmployee, controller.searchCustomers);
    bookingRoutes.post('/employee/create', employee_middleware_1.authenticateEmployee, controller.employeeCreateBooking);
    bookingRoutes.post('/employee/:bookingId/cancel', employee_middleware_1.authenticateEmployee, controller.employeeCancelBooking);
    return bookingRoutes;
};
exports.createBookingRoutes = createBookingRoutes;
// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 
