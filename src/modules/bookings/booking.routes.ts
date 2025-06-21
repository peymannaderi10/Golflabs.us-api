import { Router } from 'express';
import { BookingController } from './booking.controller';

export const bookingRoutes = Router();
const controller = new BookingController();

// Booking management routes
bookingRoutes.post('/reserve', controller.reserveBooking);
bookingRoutes.get('/', controller.getBookings);

// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 