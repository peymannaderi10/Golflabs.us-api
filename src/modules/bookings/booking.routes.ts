import { Router } from 'express';
import { BookingController } from './booking.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee } from './employee.middleware';

export const createBookingRoutes = (socketService: SocketService): Router => {
  const bookingRoutes = Router();
  const controller = new BookingController(socketService);

  // Booking management routes
  bookingRoutes.post('/reserve', controller.reserveBooking);
  bookingRoutes.get('/', controller.getBookings);

  // Employee-only routes
  bookingRoutes.get('/employee', authenticateEmployee, controller.getEmployeeBookings);
  bookingRoutes.get('/employee/customers/search', authenticateEmployee, controller.searchCustomers);
  bookingRoutes.post('/employee/:bookingId/cancel', authenticateEmployee, controller.employeeCancelBooking);

  return bookingRoutes;
};

// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 