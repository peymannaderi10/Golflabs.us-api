import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { BookingController } from './booking.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateUser, authenticateKiosk, authenticateKioskOrEmployee, enforceLocationScope, resolveResourceLocation } from '../auth';
import { handleValidationErrors, validateUUID } from '../../shared/middleware/validation';

export const createBookingRoutes = (socketService: SocketService): Router => {
  const bookingRoutes = Router();
  const controller = new BookingController(socketService);

  bookingRoutes.post('/reserve', authenticateUser,
    validateUUID('locationId', 'body'), validateUUID('spaceId', 'body'),
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

  bookingRoutes.get('/:bookingId/check-availability', authenticateUser,
    validateUUID('bookingId', 'param'),
    handleValidationErrors,
    controller.checkAvailability
  );

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

  // Employee-only routes. Every one goes through authenticate +
  // enforceLocationScope. Resource-param routes (`:bookingId`) resolve
  // locationId from the booking row before enforcement.
  const scopeBooking = [resolveResourceLocation('bookings', 'bookingId'), enforceLocationScope];

  bookingRoutes.get('/employee', authenticateEmployee, enforceLocationScope, controller.getEmployeeBookings);
  bookingRoutes.get('/employee/customers/search', authenticateEmployee, enforceLocationScope, controller.searchCustomers);
  bookingRoutes.post('/employee/create', authenticateEmployee, enforceLocationScope,
    validateUUID('locationId', 'body'), validateUUID('spaceId', 'body'),
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
    ...scopeBooking,
    controller.employeeExtendBooking
  );
  bookingRoutes.post('/employee/:bookingId/cancel', authenticateEmployee,
    validateUUID('bookingId', 'param'),
    handleValidationErrors,
    ...scopeBooking,
    controller.employeeCancelBooking
  );
  bookingRoutes.post('/employee/:bookingId/reschedule', authenticateEmployee,
    validateUUID('bookingId', 'param'),
    body('startTime').notEmpty().withMessage('startTime is required'),
    body('endTime').notEmpty().withMessage('endTime is required'),
    body('locationId').notEmpty().withMessage('locationId is required'),
    body('spaceId').notEmpty().withMessage('spaceId is required'),
    handleValidationErrors,
    ...scopeBooking,
    controller.employeeRescheduleBooking
  );

  return bookingRoutes;
};

// Note: User-specific routes (/users/:userId/bookings/*) are handled at root level in app.ts for backwards compatibility 