import { Server, Socket } from 'socket.io';
import { BookingService } from '../bookings/booking.service';
import { supabase } from '../../config/database';

/**
 * Service to manage WebSocket connections and broadcasts.
 */
export class SocketService {
  private io: Server;
  private bookingService: BookingService;

  constructor(io: Server) {
    this.io = io;
    this.bookingService = new BookingService();
    console.log('SocketService initialized.');
  }

  /**
   * Initializes the socket connection handlers.
   */
  public init() {
    this.io.on('connection', (socket: Socket) => {
      console.log('A client connected:', socket.id);

      // Register a kiosk and have it join a room based on its location
      socket.on('register_kiosk', (payload: { locationId: string; bayId: string }) => {
        if (payload.locationId) {
          const room = `location-${payload.locationId}`;
          socket.join(room);
          console.log(`Socket ${socket.id} (Bay ${payload.bayId}) joined room: ${room}`);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  /**
   * Fetches the latest bookings for a location and broadcasts them to the relevant room.
   * @param locationId The ID of the location to update.
   */
  public async triggerBookingUpdate(locationId: string) {
    if (!locationId) return;

    console.log(`Triggering booking update for location: ${locationId}`);
    try {
      // We need to get the current date in the location's specific timezone
      const dateForLocation = await this.getTodayForLocation(locationId);
      if (!dateForLocation) {
        console.error(`Could not determine date for location ${locationId}, aborting broadcast.`);
        return;
      }

      const bookings = await this.bookingService.getBookings(locationId, dateForLocation);
      const room = `location-${locationId}`;
      this.io.to(room).emit('bookings_updated', bookings);
      console.log(`Broadcasted bookings_updated to room ${room} with ${bookings.length} bookings.`);
    } catch (error: any) {
      console.error(`Failed to trigger booking update for location ${locationId}:`, error.message);
    }
  }

  /**
   * Gets the location's timezone from the database and returns the current date
   * formatted as 'YYYY-MM-DD'.
   * @param locationId The ID of the location.
   * @returns A date string or null if the location is not found.
   */
  private async getTodayForLocation(locationId: string): Promise<string | null> {
    const { data: location, error } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    if (error || !location) {
      console.error(`Could not fetch timezone for location ${locationId}:`, error);
      return null;
    }

    // 'en-CA' gives the YYYY-MM-DD format needed by the getBookings method.
    return new Date().toLocaleDateString('en-CA', { timeZone: location.timezone });
  }
} 