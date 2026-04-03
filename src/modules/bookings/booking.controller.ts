import { Request, Response } from 'express';
import { BookingService } from './booking.service';
import { CapacityHoldService } from './capacity-hold.service';
import { SocketService } from '../sockets/socket.service';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';

export class BookingController {
  private bookingService: BookingService;
  private capacityHoldService: CapacityHoldService;
  private socketService: SocketService;

  constructor(socketService: SocketService) {
    this.bookingService = new BookingService();
    this.capacityHoldService = new CapacityHoldService();
    this.socketService = socketService;
  }

  reserveBooking = async (req: Request, res: Response) => {
    try {
      const authenticatedUserId = (req as AuthenticatedRequest).user?.id;
      const result = await this.bookingService.reserveBooking({
        ...req.body,
        userId: authenticatedUserId,
      });
      res.status(201).json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in /bookings/reserve');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getBookings = async (req: Request, res: Response) => {
    try {
      const { locationId, date, startTime } = req.query;

      if (!locationId || !date) {
        return res.status(400).json({ error: 'locationId and date are required query parameters' });
      }

      const bookings = await this.bookingService.getBookings(locationId as string, date as string, startTime as string | undefined);
      res.json(bookings);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in /bookings endpoint');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getCapacityHolds = async (req: Request, res: Response) => {
    try {
      const { locationId, date } = req.query;

      if (!locationId || !date) {
        return res.status(400).json({ error: 'locationId and date are required query parameters' });
      }

      const holds = await this.capacityHoldService.getHoldsForDate(
        locationId as string,
        date as string
      );
      res.json(holds);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching capacity holds');
      res.status(500).json({ error: 'Failed to fetch capacity holds' });
    }
  };

  getTodaysHold = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;

      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }

      const hold = await this.capacityHoldService.getTodaysHold(locationId as string);
      res.json(hold);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching today\'s hold');
      res.status(500).json({ error: 'Failed to fetch today\'s hold' });
    }
  };

  getUserReservedBookings = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = (req as AuthenticatedRequest).user?.id;
      if (authenticatedUserId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const result = await this.bookingService.getUserReservedBookings(userId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error, userId: req.params.userId }, 'Error in user reserved bookings endpoint');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getUserFutureBookings = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = (req as AuthenticatedRequest).user?.id;
      if (authenticatedUserId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const bookings = await this.bookingService.getUserFutureBookings(userId);
      res.json(bookings);
    } catch (error: any) {
      logger.error({ err: error, userId: req.params.userId }, 'Error in user future bookings endpoint');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getUserPastBookings = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = (req as AuthenticatedRequest).user?.id;
      if (authenticatedUserId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = await this.bookingService.getUserPastBookings(userId, page, pageSize);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error, userId: req.params.userId }, 'Error in user past bookings endpoint');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  cancelBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = (req as AuthenticatedRequest).user!.id;
      const result = await this.bookingService.cancelBooking(bookingId, userId);
      res.json(result);

      // After successfully cancelling, trigger a real-time update
      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error cancelling booking');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // Employee-specific endpoints
  getEmployeeBookings = async (req: Request, res: Response) => {
    try {
      const { locationId, startDate, endDate, date, bayId, customerEmail } = req.query;

      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }

      // Accept `date` as shorthand for startDate=date & endDate=date
      const resolvedStart = (startDate || date) as string;
      const resolvedEnd = (endDate || date) as string;

      const bookings = await this.bookingService.getAllBookingsForEmployee(
        locationId as string,
        resolvedStart,
        resolvedEnd,
        bayId as string,
        customerEmail as string
      );
      res.json(bookings);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in employee bookings endpoint');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  searchCustomers = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({ error: 'email is required' });
      }

      const customers = await this.bookingService.searchCustomersByEmail(email as string);
      res.json(customers);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in customer search endpoint');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  employeeCancelBooking = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { reason, skipRefund } = req.body;
      const employeeProfile = req.employeeProfile;

      if (!employeeProfile) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }

      const bookingLocationId = await this.bookingService.getBookingLocationId(bookingId);
      if (!bookingLocationId) return res.status(404).json({ error: 'Booking not found' });
      if (bookingLocationId !== employeeProfile.location_id) {
        return res.status(403).json({ error: 'Access denied: booking belongs to a different location' });
      }

      const result = await this.bookingService.employeeCancelBooking(bookingId, employeeProfile.id, reason, !!skipRefund);
      res.json(result);

      // Trigger socket update for real-time booking changes
      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in employee cancel booking');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  cancelReservedBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = (req as AuthenticatedRequest).user!.id;
      const result = await this.bookingService.cancelReservedBooking(bookingId, userId);
      res.json(result);

      // After successfully cancelling, trigger a real-time update
      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error cancelling reserved booking');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // Session extension endpoints (called by kiosk)
  getExtensionOptions = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const result = await this.bookingService.getExtensionOptions(bookingId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error getting extension options for booking');
      if (error.message === 'Booking not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Booking has already ended' || error.message === 'Booking is not confirmed') {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  extendBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { extensionMinutes, locationId, bayId, useFreeMinutes } = req.body;

      if (!extensionMinutes || !locationId || !bayId) {
        return res.status(400).json({ error: 'extensionMinutes, locationId, and bayId are required' });
      }

      const result = await this.bookingService.extendBooking(bookingId, extensionMinutes, locationId, bayId, !!useFreeMinutes);
      res.json(result);

      // Trigger real-time update to the kiosk so countdown resets
      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error extending booking');
      if (error.message === 'Booking not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('conflict') || error.message.includes('already ended') || error.message.includes('not confirmed')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  employeeExtendBooking = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { extensionMinutes, locationId, bayId, skipPayment } = req.body;
      const employeeProfile = req.employeeProfile;

      if (!employeeProfile) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }

      const bookingLocationId = await this.bookingService.getBookingLocationId(bookingId);
      if (!bookingLocationId) return res.status(404).json({ error: 'Booking not found' });
      if (bookingLocationId !== employeeProfile.location_id) {
        return res.status(403).json({ error: 'Access denied: booking belongs to a different location' });
      }

      if (!extensionMinutes || !locationId || !bayId) {
        return res.status(400).json({ error: 'extensionMinutes, locationId, and bayId are required' });
      }

      const result = await this.bookingService.employeeExtendBooking(
        bookingId,
        extensionMinutes,
        locationId,
        bayId,
        employeeProfile.id,
        skipPayment === true
      );
      res.json(result);

      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in employee extend booking');
      if (error.message === 'Booking not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('conflict') || error.message.includes('already ended') || error.message.includes('not confirmed')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  employeeRescheduleBooking = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { startTime, endTime, locationId, bayId, adjustPrice } = req.body;
      const employeeProfile = req.employeeProfile;

      if (!employeeProfile) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }

      const bookingLocationId = await this.bookingService.getBookingLocationId(bookingId);
      if (!bookingLocationId) return res.status(404).json({ error: 'Booking not found' });
      if (bookingLocationId !== employeeProfile.location_id) {
        return res.status(403).json({ error: 'Access denied: booking belongs to a different location' });
      }

      if (!startTime || !endTime || !locationId || !bayId) {
        return res.status(400).json({ error: 'startTime, endTime, locationId, and bayId are required' });
      }

      const result = await this.bookingService.employeeRescheduleBooking(
        bookingId,
        startTime,
        endTime,
        locationId,
        bayId,
        employeeProfile.id,
        adjustPrice === true
      );
      res.json(result);

      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in employee reschedule booking');
      if (error.message === 'Booking not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('conflict') || error.message.includes('not confirmed')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // Employee create booking - bypasses Stripe payment
  employeeCreateBooking = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeProfile = req.employeeProfile;

      if (!employeeProfile) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }

      const result = await this.bookingService.createEmployeeBooking(req.body, employeeProfile.id);
      res.status(201).json(result);

      // Trigger socket update for real-time booking changes
      try {
        if (result.locationId && result.bayId) {
          this.socketService.triggerBookingUpdate(result.locationId, result.bayId, result.bookingId);
        }
      } catch (socketErr) {
        logger.error({ err: socketErr, bookingId: result.bookingId }, 'Socket update failed (non-fatal)');
      }
    } catch (error: any) {
      logger.error({ err: error }, 'Error in employee create booking');
      res.status(400).json({ error: sanitizeError(error) });
    }
  };
} 