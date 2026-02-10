import { Request, Response } from 'express';
import { BookingService } from './booking.service';
import { SocketService } from '../sockets/socket.service';

export class BookingController {
  private bookingService: BookingService;
  private socketService: SocketService;

  constructor(socketService: SocketService) {
    this.bookingService = new BookingService();
    this.socketService = socketService;
  }

  reserveBooking = async (req: Request, res: Response) => {
    try {
      const result = await this.bookingService.reserveBooking(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error in /bookings/reserve:", error);
      res.status(500).json({ error: error.message });
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
      console.error('Error in /bookings endpoint:', error);
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getUserReservedBookings = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const result = await this.bookingService.getUserReservedBookings(userId);
      res.json(result);
    } catch (error: any) {
      console.error(`Error in /users/${req.params.userId}/bookings/reserved endpoint:`, error);
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getUserFutureBookings = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const bookings = await this.bookingService.getUserFutureBookings(userId);
      res.json(bookings);
    } catch (error: any) {
      console.error(`Error in /users/${req.params.userId}/bookings/future endpoint:`, error);
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getUserPastBookings = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const bookings = await this.bookingService.getUserPastBookings(userId);
      res.json(bookings);
    } catch (error: any) {
      console.error(`Error in /users/${req.params.userId}/bookings/past endpoint:`, error);
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  cancelBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { userId } = req.body;
      const result = await this.bookingService.cancelBooking(bookingId, userId);
      res.json(result);

      // After successfully cancelling, trigger a real-time update
      if (result.locationId && result.bayId) {
        this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
      }
    } catch (error: any) {
      console.error(`Error cancelling booking ${req.params.bookingId}:`, error);
      res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
    }
  };

  // Employee-specific endpoints
  getEmployeeBookings = async (req: Request, res: Response) => {
    try {
      const { locationId, startDate, endDate, bayId, customerEmail } = req.query;

      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }

      const bookings = await this.bookingService.getAllBookingsForEmployee(
        locationId as string, 
        startDate as string,
        endDate as string,
        bayId as string, 
        customerEmail as string
      );
      res.json(bookings);
    } catch (error: any) {
      console.error('Error in employee bookings endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  };

  searchCustomers = async (req: Request, res: Response) => {
    try {
      const { email, locationId } = req.query;

      if (!email || !locationId) {
        return res.status(400).json({ error: 'email and locationId are required' });
      }

      const customers = await this.bookingService.searchCustomersByEmail(email as string, locationId as string);
      res.json(customers);
    } catch (error: any) {
      console.error('Error in customer search endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  };

  employeeCancelBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;
      const employeeProfile = (req as any).employeeProfile;

      if (!employeeProfile) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }

      const result = await this.bookingService.employeeCancelBooking(bookingId, employeeProfile.id, reason);
      res.json(result);

      // Trigger socket update for real-time booking changes
      if (result.locationId && result.bayId) {
        this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
      }
    } catch (error: any) {
      console.error(`Error in employee cancel booking ${req.params.bookingId}:`, error);
      res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
    }
  };

  cancelReservedBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { userId } = req.body;
      const result = await this.bookingService.cancelReservedBooking(bookingId, userId);
      res.json(result);

      // After successfully cancelling, trigger a real-time update
      if (result.locationId && result.bayId) {
        this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
      }
    } catch (error: any) {
      console.error(`Error cancelling reserved booking ${req.params.bookingId}:`, error);
      res.status(500).json({ error: 'Failed to cancel reservation', details: error.message });
    }
  };

  // Session extension endpoints (called by kiosk)
  getExtensionOptions = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const result = await this.bookingService.getExtensionOptions(bookingId);
      res.json(result);
    } catch (error: any) {
      console.error(`Error getting extension options for booking ${req.params.bookingId}:`, error);
      if (error.message === 'Booking not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Booking has already ended' || error.message === 'Booking is not confirmed') {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to get extension options' });
    }
  };

  extendBooking = async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { extensionMinutes, locationId, bayId } = req.body;

      if (!extensionMinutes || !locationId || !bayId) {
        return res.status(400).json({ error: 'extensionMinutes, locationId, and bayId are required' });
      }

      const result = await this.bookingService.extendBooking(bookingId, extensionMinutes, locationId, bayId);
      res.json(result);

      // Trigger real-time update to the kiosk so countdown resets
      if (result.locationId && result.bayId) {
        this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
      }
    } catch (error: any) {
      console.error(`Error extending booking ${req.params.bookingId}:`, error);
      if (error.message === 'Booking not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('conflict') || error.message.includes('already ended') || error.message.includes('not confirmed')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to extend booking' });
    }
  };

  // Employee create booking - bypasses Stripe payment
  employeeCreateBooking = async (req: Request, res: Response) => {
    try {
      const employeeProfile = (req as any).employeeProfile;

      if (!employeeProfile) {
        return res.status(403).json({ error: 'Employee authentication required' });
      }

      const result = await this.bookingService.createEmployeeBooking(req.body, employeeProfile.id);
      res.status(201).json(result);

      // Trigger socket update for real-time booking changes
      if (result.locationId && result.bayId) {
        this.socketService.triggerBookingUpdate(result.locationId, result.bayId, result.bookingId);
      }
    } catch (error: any) {
      console.error('Error in employee create booking:', error);
      res.status(400).json({ error: error.message || 'Failed to create booking' });
    }
  };
} 