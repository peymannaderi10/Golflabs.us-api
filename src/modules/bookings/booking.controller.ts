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
      const { locationId, date } = req.query;

      if (!locationId || !date) {
        return res.status(400).json({ error: 'locationId and date are required query parameters' });
      }

      const bookings = await this.bookingService.getBookings(locationId as string, date as string);
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
      if (result.locationId) {
        this.socketService.triggerBookingUpdate(result.locationId);
      }
    } catch (error: any) {
      console.error(`Error cancelling booking ${req.params.bookingId}:`, error);
      res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
    }
  };
} 