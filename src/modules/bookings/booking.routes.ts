import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { BookingController } from './booking.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateUser, authenticateKiosk, authenticateKioskOrEmployee, validateLocationAccess } from '../auth';
import { handleValidationErrors, validateUUID } from '../../shared/middleware/validation';

export const createBookingRoutes = (socketService: SocketService): Router => {
  const bookingRoutes = Router();
  const controller = new BookingController(socketService);

  bookingRoutes.post('/reserve', authenticateUser,
    validateUUID('locationId', 'body'), validateUUID('bayId', 'body'),
    body('startTime').notEmpty().withMessage('startTime is required'),
    body('endTime').notEmpty().withMessage('endTime is required'),
    body('date').notEmpty().withMessage('date is required'),
    body('partySize').optional().isInt({ min: 1 }).withMessage('partySize must be an integer >= 1'),
    handleValidationErrors,
    controller.reserveBooking
  );
  bookingRoutes.get('/', controller.getBookings);

  bookingRoutes.get('/capacity-holds', controller.getCapacityHolds);
  bookingRoutes.get('/capacity-holds/today', controller.getTodaysHold);

  bookingRoutes.get('/:bookingId/extension-options', authenticateKioskOrEmployee,
    validateUUID('bookingId', 'param'),
    handleValidationErrors,
    controller.getExtensionOptions
  );
  bookingRoutes.post('/:bookingId/extend', authenticateKioskOrEmployee,
    validateUUID('bookingId', 'param'),
    body('extensionMinutes').isInt({ min: 15 }).withMessage('extensionMinutes must be an integer >= 15'),
    body('useFreeMinutes').optional().isBoolean().withMessage('useFreeMinutes must be a boolean'),
    handleValidationErrors,
    controller.extendBooking
  );

  // Employee-only routes
  bookingRoutes.get('/employee', authenticateEmployee, validateLocationAccess('query'), controller.getEmployeeBookings);
  bookingRoutes.get('/employee/customers/search', authenticateEmployee, controller.searchCustomers);
  bookingRoutes.post('/employee/create', authenticateEmployee, validateLocationAccess('body'),
    validateUUID('locationId', 'body'), validateUUID('bayId', 'body'),
    body('startTime').notEmpty().withMessage('startTime is required'),
    body('endTime').notEmpty().withMessage('endTime is required'),
    body('date').notEmpty().withMessage('date is required'),
    handleValidationErrors,
    controller.employeeCreateBooking
  );
  bookingRoutes.post('/employee/:bookingId/extend', authenticateEmployee,
    validateUUID('bookingId', 'param'),
    body('extensionMinutes').isInt({ min: 15 }).withMessage('extensionMinutes must be an integer >= 15'),
    handleValidationErrors,
    controller.employeeExtendBooking
  );
  bookingRoutes.post('/employee/:bookingId/cancel', authenticateEmployee,
    validateUUID('bookingId', 'param'),
    handleValidationErrors,
    controller.employeeCancelBooking
  );
  bookingRoutes.post('/employee/:bookingId/reschedule', authenticateEmployee,
    validateUUID('bookingId', 'param'),
    body('startTime').notEmpty().withMessage('startTime is required'),
    body('endTime').notEmpty().withMessage('endTime is required'),
    body('locationId').notEmpty().withMessage('locationId is required'),
    body('bayId').notEmpty().withMessage('bayId is required'),
    handleValidationErrors,
    controller.employeeRescheduleBooking
  );

  return bookingRoutes;
};

// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 