import { Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { BookingController } from './booking.controller';
import { SocketService } from '../sockets/socket.service';
import { authenticateEmployee, authenticateUser, authenticateKiosk, authenticateKioskOrEmployee, enforceLocationScope, resolveResourceLocation } from '../auth';
import { handleValidationErrors, validateUUID } from '../../shared/middleware/validation';

const guestReserveRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 guest reservations per IP per 15 min
  message: { error: 'Too many reservation attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
  // Guest checkout: no auth required, rate-limited. Returns a Stripe client
  // secret — no booking row is created here; the booking is materialized by
  // the stripe webhook on payment success.
  bookingRoutes.post('/guest-checkout-session', guestReserveRateLimit,
    validateUUID('locationId', 'body'), validateUUID('spaceId', 'body'),
    body('startTime').notEmpty().withMessage('startTime is required'),
    body('endTime').notEmpty().withMessage('endTime is required'),
    body('date').notEmpty().withMessage('date is required'),
    body('guestEmail').isEmail().withMessage('Valid email is required'),
    body('guestName').isString().notEmpty().withMessage('Name is required'),
    body('guestPhone').isString().notEmpty().withMessage('Phone is required'),
    body('partySize').optional().isInt({ min: 1 }),
    body('documentHashes').isObject().withMessage('documentHashes must be an object'),
    body('existingBookingId').optional({ nullable: true }).isUUID().withMessage('existingBookingId must be a UUID'),
    handleValidationErrors,
    controller.createGuestCheckoutSession,
  );
  // Guest reservation hold: claim the slot the moment the guest lands on
  // /guest-checkout so concurrent guests fail fast at form-submit time.
  // Returns nulls if the location has the hold feature off — frontend
  // noops in that case.
  bookingRoutes.post('/guest-reservation/init', guestReserveRateLimit,
    validateUUID('locationId', 'body'), validateUUID('spaceId', 'body'),
    body('startTime').notEmpty(),
    body('endTime').notEmpty(),
    body('date').notEmpty(),
    body('partySize').optional().isInt({ min: 1 }),
    handleValidationErrors,
    controller.createGuestReservationHold,
  );
  bookingRoutes.delete('/guest-reservation/:bookingId', guestReserveRateLimit,
    validateUUID('bookingId', 'param'),
    handleValidationErrors,
    controller.cancelGuestReservationHold,
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