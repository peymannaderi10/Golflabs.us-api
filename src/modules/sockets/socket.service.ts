import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { BookingService } from '../bookings/booking.service';
import { supabase } from '../../config/database';
import { LeagueScorePayload, LeagueStandingsPayload } from '../leagues/league.types';
import { logger } from '../../shared/utils/logger';

/**
 * Service to manage WebSocket connections and broadcasts.
 */
export class SocketService {
  private io: Server;
  private bookingService: BookingService;

  constructor(io: Server) {
    this.io = io;
    this.bookingService = new BookingService();
    logger.info('SocketService initialized');
  }

  private isValidKioskKey(key: string | undefined): boolean {
    const expectedKey = process.env.KIOSK_API_KEY;
    if (!expectedKey || !key) return false;

    const keyBuffer = Buffer.from(key);
    const expectedBuffer = Buffer.from(expectedKey);
    if (keyBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, expectedBuffer);
  }

  /**
   * Initializes the socket connection handlers.
   */
  public init() {
    this.io.on('connection', (socket: Socket) => {
      logger.info({ socketId: socket.id }, 'A client connected');

      // Validate kiosk API key from handshake auth, then join rooms
      socket.on('register_kiosk', (payload: { locationId: string; spaceId: string }) => {
        const kioskKey = socket.handshake.auth?.kioskKey as string | undefined;
        if (!this.isValidKioskKey(kioskKey)) {
          logger.warn({ socketId: socket.id }, 'Socket failed kiosk auth for register_kiosk');
          socket.emit('auth_error', { message: 'Invalid or missing kiosk API key' });
          return;
        }

        if (payload.locationId && payload.spaceId) {
          const spaceRoom = `location-${payload.locationId}-space-${payload.spaceId}`;
          const locationRoom = `location-${payload.locationId}`;
          socket.join(spaceRoom);
          socket.join(locationRoom);
          socket.data.isKiosk = true;
          logger.info({ socketId: socket.id, spaceId: payload.spaceId, spaceRoom, locationRoom }, 'Socket joined rooms');
        }
      });

      // Only allow booking requests from authenticated kiosk sockets
      socket.on('request_initial_bookings', (payload: { locationId: string; spaceId: string }) => {
        if (!socket.data.isKiosk) {
          socket.emit('auth_error', { message: 'Not authenticated as kiosk' });
          return;
        }
        if (payload.locationId && payload.spaceId) {
          logger.info({ socketId: socket.id, spaceId: payload.spaceId }, 'Kiosk requested initial bookings');
          this.sendAllBookingsUpdate(payload.locationId, payload.spaceId);
        }
      });

      // Register a kiosk/TV to a league room (requires kiosk auth)
      socket.on('register_league', (payload: { locationId: string; leagueId: string }) => {
        if (!socket.data.isKiosk) {
          socket.emit('auth_error', { message: 'Not authenticated as kiosk' });
          return;
        }
        if (payload.locationId && payload.leagueId) {
          const room = `location-${payload.locationId}-league-${payload.leagueId}`;
          socket.join(room);
          logger.info({ socketId: socket.id, room }, 'Socket joined league room');
        }
      });

      // Register an employee dashboard to receive real-time updates for a location
      socket.on('register_dashboard', async (payload: { locationId: string }) => {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) {
          socket.emit('auth_error', { message: 'Authentication required' });
          return;
        }

        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (error || !user) {
            socket.emit('auth_error', { message: 'Invalid token' });
            return;
          }

          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role, location_id')
            .eq('id', user.id)
            .single();

          if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
            socket.emit('auth_error', { message: 'Employee access required' });
            return;
          }

          if (profile.location_id !== payload.locationId) {
            socket.emit('auth_error', { message: 'Access denied for this location' });
            return;
          }

          if (payload.locationId) {
            const locationRoom = `location-${payload.locationId}`;
            const dashboardRoom = `dashboard-${payload.locationId}`;
            socket.join(locationRoom);
            socket.join(dashboardRoom);
            socket.data.isDashboard = true;
            logger.info({ socketId: socket.id, locationId: payload.locationId, dashboardRoom }, 'Dashboard joined location rooms');
          }
        } catch (err) {
          logger.error({ err, socketId: socket.id }, 'Dashboard socket auth failed');
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      socket.on('disconnect', () => {
        logger.info({ socketId: socket.id }, 'Client disconnected');
      });
    });
  }

  /**
   * Fetches the specific booking and broadcasts it to the space kiosk.
   * @param locationId The ID of the location to update.
   * @param spaceId The ID of the specific space to update.
   * @param bookingId The specific booking that changed (optional, if not provided will send all bookings)
   */
  public async triggerBookingUpdate(locationId: string, spaceId: string, bookingId?: string) {
    if (!locationId || !spaceId) return;

    logger.info({ locationId, spaceId, bookingId }, 'Triggering booking update');
    try {
      if (bookingId) {
        // Send only the specific booking that changed
        await this.sendSpecificBookingUpdate(locationId, spaceId, bookingId);
      } else {
        // Fallback: send all bookings (for initial load or polling)
        await this.sendAllBookingsUpdate(locationId, spaceId);
      }
    } catch (error: any) {
      logger.error({ err: error, locationId, spaceId }, 'Failed to trigger booking update');
    }
  }

  /**
   * Send update for a specific booking
   */
  private async sendSpecificBookingUpdate(locationId: string, spaceId: string, bookingId: string) {
    // Get the specific booking details
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, space_id, user_id, start_time, end_time, status')
      .eq('id', bookingId)
      .eq('location_id', locationId)
      .eq('space_id', spaceId)
      .single();

    if (error || !booking) {
      logger.error({ err: error, bookingId }, 'Could not fetch booking for update');
      return;
    }

    // Get location timezone for proper time formatting
    const dateForLocation = await this.getTodayForLocation(locationId);
    if (!dateForLocation) {
      logger.error({ locationId }, 'Could not determine date for location, aborting broadcast');
      return;
    }

    // Format the booking time for display
    const startTimeUTC = new Date(booking.start_time);
    const endTimeUTC = new Date(booking.end_time);
    
    const [{ data: location }, { data: settings }] = await Promise.all([
      supabase.from('locations').select('timezone').eq('id', locationId).single(),
      supabase.from('location_settings').select('booking_grace_period_before_minutes, booking_grace_period_after_minutes').eq('location_id', locationId).single(),
    ]);

    const timezone = location?.timezone || 'America/New_York';
    const graceBefore = (settings?.booking_grace_period_before_minutes || 0) * 60_000;
    const graceAfter = (settings?.booking_grace_period_after_minutes || 0) * 60_000;

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
      spaceId,
      date: dateForLocation,
      booking: {
        id: booking.id,
        spaceId: booking.space_id,
        userId: booking.user_id,
        startTime: startTimeLocal,
        endTime: endTimeLocal,
        startTimeISO: new Date(startTimeUTC.getTime() - graceBefore).toISOString(),
        endTimeISO: new Date(endTimeUTC.getTime() + graceAfter).toISOString(),
        startTimeOriginalISO: startTimeUTC.toISOString(),
        endTimeOriginalISO: endTimeUTC.toISOString(),
        status: booking.status
      },
      timestamp: new Date().toISOString()
    };

    const room = `location-${locationId}-space-${spaceId}`;
    this.io.to(room).emit('booking_update', payload);
    logger.info({ action: payload.action, room, bookingId }, 'Broadcasted booking update');
  }

  /**
   * Send all bookings for a space (fallback method)
   */
  private async sendAllBookingsUpdate(locationId: string, spaceId: string) {
    // We need to get the current date in the location's specific timezone
    const dateForLocation = await this.getTodayForLocation(locationId);
    if (!dateForLocation) {
      logger.error({ locationId }, 'Could not determine date for location, aborting broadcast');
      return;
    }

    const [bookings, { data: graceSettings }] = await Promise.all([
      this.bookingService.getBookings(locationId, dateForLocation),
      supabase.from('location_settings').select('booking_grace_period_before_minutes, booking_grace_period_after_minutes').eq('location_id', locationId).single(),
    ]);

    const graceBefore = (graceSettings?.booking_grace_period_before_minutes || 0) * 60_000;
    const graceAfter = (graceSettings?.booking_grace_period_after_minutes || 0) * 60_000;

    // Filter bookings for this specific space
    const spaceBookings = bookings.filter(booking => booking.spaceId === spaceId);

    // Enhanced payload with location and space information for precise kiosk targeting
    const payload = {
      type: 'bookings_refresh',
      locationId,
      spaceId,
      date: dateForLocation,
      bookings: spaceBookings.map(booking => ({
        id: booking.id,
        spaceId: booking.spaceId,
        userId: booking.userId,
        startTime: booking.startTime,
        endTime: booking.endTime,
        startTimeISO: new Date(new Date(booking.startTimeISO).getTime() - graceBefore).toISOString(),
        endTimeISO: new Date(new Date(booking.endTimeISO).getTime() + graceAfter).toISOString(),
        startTimeOriginalISO: booking.startTimeISO,
        endTimeOriginalISO: booking.endTimeISO,
        status: 'confirmed'
      })),
      timestamp: new Date().toISOString()
    };

    const room = `location-${locationId}-space-${spaceId}`;
    this.io.to(room).emit('bookings_updated', payload);
    logger.info({ room, bookingCount: spaceBookings.length, spaceId, date: dateForLocation }, 'Broadcasted bookings_updated');
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
      logger.error({ err: error, locationId }, 'Could not fetch timezone for location');
      return null;
    }

    // 'en-CA' gives the YYYY-MM-DD format needed by the getBookings method.
    return new Date().toLocaleDateString('en-CA', { timeZone: location.timezone });
  }

  // =====================================================
  // LEAGUE REAL-TIME EVENTS
  // =====================================================

  /**
   * Broadcasts a score update to all clients in the league room.
   * Called after a player submits a score via kiosk or employee dashboard.
   */
  public emitScoreUpdate(locationId: string, leagueId: string, payload: LeagueScorePayload) {
    const room = `location-${locationId}-league-${leagueId}`;
    this.io.to(room).emit('league_score_update', payload);
    logger.info({ room, playerName: payload.player.displayName, holeNumber: payload.holeNumber }, 'Broadcasted league_score_update');
  }

  /**
   * Broadcasts updated standings to all clients in the league room.
   * Called after week finalization or handicap recalculation.
   */
  public emitStandingsUpdate(locationId: string, leagueId: string, payload: LeagueStandingsPayload) {
    const room = `location-${locationId}-league-${leagueId}`;
    this.io.to(room).emit('league_standings_update', payload);
    logger.info({ room, playerCount: payload.standings.length }, 'Broadcasted league_standings_update');
  }

  /**
   * Sends an unlock command to the specified kiosk and waits for a response.
   * @param locationId The ID of the location.
   * @param spaceId The ID of the space.
   * @param duration The duration in seconds for the door to remain unlocked.
   * @param bookingId The ID of the booking triggering the unlock.
   * @returns A promise that resolves to true if the unlock was successful, otherwise false.
   */
  public async sendUnlockCommand(locationId: string, spaceId: string, duration: number, bookingId: string): Promise<boolean> {
    const room = `location-${locationId}-space-${spaceId}`;
    const payload = {
      type: 'door_unlock',
      duration,
      bookingId,
      locationId,
      spaceId,
      timestamp: new Date().toISOString()
    };

    try {
      const sockets = await this.io.in(room).fetchSockets();
      if (sockets.length === 0) {
        logger.error({ room }, 'No kiosk connected in room');
        return false;
      }

      const kioskSocket = sockets[0];
      logger.info({ kioskSocketId: kioskSocket.id, room }, 'Sending unlock command to kiosk');

      const response = await kioskSocket.timeout(10000).emitWithAck('unlock', payload);

      if (response.success) {
        logger.info({ kioskSocketId: kioskSocket.id }, 'Kiosk confirmed unlock success');
        return true;
      } else {
        logger.error({ kioskSocketId: kioskSocket.id, error: response.error }, 'Kiosk reported unlock failure');
        return false;
      }
    } catch (e: unknown) {
      logger.error({ err: e, room }, 'Did not receive unlock confirmation from room');
      return false;
    }
  }

  /**
   * Broadcasts an event to all kiosks at a location.
   * Kiosks join the location-level room on registration.
   */
  public broadcastToLocation(locationId: string, event: string, payload: any) {
    const room = `location-${locationId}`;
    this.io.to(room).emit(event, payload);
    logger.info({ event, room }, 'Broadcasted event to room');
  }

  /**
   * Broadcasts a space status change to all dashboards and kiosks at a location.
   */
  public broadcastSpaceUpdate(locationId: string, space: any) {
    const payload = {
      type: 'space_update',
      locationId,
      space,
      timestamp: new Date().toISOString()
    };
    this.broadcastToLocation(locationId, 'space_update', payload);
    logger.info({ locationId, spaceId: space.id, status: space.status }, 'Broadcasted space_update');
  }

  /**
   * Broadcasts when a new space is created.
   */
  public broadcastSpaceCreated(locationId: string, space: any) {
    const payload = {
      type: 'space_created',
      locationId,
      space,
      timestamp: new Date().toISOString()
    };
    this.broadcastToLocation(locationId, 'space_created', payload);
    logger.info({ locationId, spaceId: space.id }, 'Broadcasted space_created');
  }

  /**
   * Broadcasts when a space is deleted.
   */
  public broadcastSpaceDeleted(locationId: string, spaceId: string) {
    const payload = {
      type: 'space_deleted',
      locationId,
      spaceId,
      timestamp: new Date().toISOString()
    };
    this.broadcastToLocation(locationId, 'space_deleted', payload);
    logger.info({ locationId, spaceId }, 'Broadcasted space_deleted');
  }
} 