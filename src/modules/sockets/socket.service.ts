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

      // Register a kiosk and have it join a room based on its location and bay
      socket.on('register_kiosk', (payload: { locationId: string; bayId: string }) => {
        if (payload.locationId && payload.bayId) {
          const room = `location-${payload.locationId}-bay-${payload.bayId}`;
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
   * Fetches the specific booking and broadcasts it to the bay kiosk.
   * @param locationId The ID of the location to update.
   * @param bayId The ID of the specific bay to update.
   * @param bookingId The specific booking that changed (optional, if not provided will send all bookings)
   */
  public async triggerBookingUpdate(locationId: string, bayId: string, bookingId?: string) {
    if (!locationId || !bayId) return;

    console.log(`Triggering booking update for location: ${locationId}, bay: ${bayId}${bookingId ? `, booking: ${bookingId}` : ''}`);
    try {
      if (bookingId) {
        // Send only the specific booking that changed
        await this.sendSpecificBookingUpdate(locationId, bayId, bookingId);
      } else {
        // Fallback: send all bookings (for initial load or polling)
        await this.sendAllBookingsUpdate(locationId, bayId);
      }
    } catch (error: any) {
      console.error(`Failed to trigger booking update for location ${locationId}, bay ${bayId}:`, error.message);
    }
  }

  /**
   * Send update for a specific booking
   */
  private async sendSpecificBookingUpdate(locationId: string, bayId: string, bookingId: string) {
    // Get the specific booking details
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, bay_id, start_time, end_time, status')
      .eq('id', bookingId)
      .eq('location_id', locationId)
      .eq('bay_id', bayId)
      .single();

    if (error || !booking) {
      console.error(`Could not fetch booking ${bookingId} for update:`, error);
      return;
    }

    // Get location timezone for proper time formatting
    const dateForLocation = await this.getTodayForLocation(locationId);
    if (!dateForLocation) {
      console.error(`Could not determine date for location ${locationId}, aborting broadcast.`);
      return;
    }

    // Format the booking time for display
    const startTimeUTC = new Date(booking.start_time);
    const endTimeUTC = new Date(booking.end_time);
    
    const { data: location } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();
    
    const timezone = location?.timezone || 'America/New_York';
    
    const startTimeLocal = startTimeUTC.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });
    
    const endTimeLocal = endTimeUTC.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });

    const payload = {
      type: 'booking_update',
      action: booking.status === 'cancelled' ? 'remove' : 'add',
      locationId,
      bayId,
      date: dateForLocation,
      booking: {
        id: booking.id,
        bayId: booking.bay_id,
        startTime: startTimeLocal,
        endTime: endTimeLocal,
        status: booking.status
      },
      timestamp: new Date().toISOString()
    };

    const room = `location-${locationId}-bay-${bayId}`;
    this.io.to(room).emit('booking_update', payload);
    console.log(`Broadcasted ${payload.action} booking update to room ${room} for booking ${bookingId}.`);
  }

  /**
   * Send all bookings for a bay (fallback method)
   */
  private async sendAllBookingsUpdate(locationId: string, bayId: string) {
    // We need to get the current date in the location's specific timezone
    const dateForLocation = await this.getTodayForLocation(locationId);
    if (!dateForLocation) {
      console.error(`Could not determine date for location ${locationId}, aborting broadcast.`);
      return;
    }

    const bookings = await this.bookingService.getBookings(locationId, dateForLocation);
    
    // Filter bookings for this specific bay
    const bayBookings = bookings.filter(booking => booking.bayId === bayId);
    
    // Enhanced payload with location and bay information for precise kiosk targeting
    const payload = {
      type: 'bookings_refresh',
      locationId,
      bayId,
      date: dateForLocation,
      bookings: bayBookings.map(booking => ({
        id: booking.id,
        bayId: booking.bayId,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: 'confirmed' // All bookings from getBookings are confirmed
      })),
      timestamp: new Date().toISOString()
    };

    const room = `location-${locationId}-bay-${bayId}`;
    this.io.to(room).emit('bookings_updated', payload);
    console.log(`Broadcasted bookings_updated to room ${room} with ${bayBookings.length} bookings for bay ${bayId} on date ${dateForLocation}.`);
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