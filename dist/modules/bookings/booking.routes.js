"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBookingRoutes = void 0;
const express_1 = require("express");
const booking_controller_1 = require("./booking.controller");
const createBookingRoutes = (socketService) => {
    const bookingRoutes = (0, express_1.Router)();
    const controller = new booking_controller_1.BookingController(socketService);
    // Booking management routes
    bookingRoutes.post('/reserve', controller.reserveBooking);
    bookingRoutes.get('/', controller.getBookings);
    return bookingRoutes;
};
exports.createBookingRoutes = createBookingRoutes;
// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 
