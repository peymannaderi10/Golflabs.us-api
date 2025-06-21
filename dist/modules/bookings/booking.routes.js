"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingRoutes = void 0;
const express_1 = require("express");
const booking_controller_1 = require("./booking.controller");
exports.bookingRoutes = (0, express_1.Router)();
const controller = new booking_controller_1.BookingController();
// Booking management routes
exports.bookingRoutes.post('/reserve', controller.reserveBooking);
exports.bookingRoutes.get('/', controller.getBookings);
// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 
