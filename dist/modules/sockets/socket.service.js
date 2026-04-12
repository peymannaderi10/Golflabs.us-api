"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const booking_service_1 = require("../bookings/booking.service");
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
/**
 * Service to manage WebSocket connections and broadcasts.
 */
class SocketService {
    constructor(io) {
        this.io = io;
        this.bookingService = new booking_service_1.BookingService();
        logger_1.logger.info('SocketService initialized');
    }
    isValidKioskKey(key) {
        const expectedKey = process.env.KIOSK_API_KEY;
        if (!expectedKey || !key)
            return false;
        const keyBuffer = Buffer.from(key);
        const expectedBuffer = Buffer.from(expectedKey);
        if (keyBuffer.length !== expectedBuffer.length)
            return false;
        return crypto_1.default.timingSafeEqual(keyBuffer, expectedBuffer);
    }
    /**
     * Initializes the socket connection handlers.
     */
    init() {
        this.io.on('connection', (socket) => {
            logger_1.logger.info({ socketId: socket.id }, 'A client connected');
            // Validate kiosk API key from handshake auth, then join rooms
            socket.on('register_kiosk', (payload) => {
                var _a;
                const kioskKey = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.kioskKey;
                if (!this.isValidKioskKey(kioskKey)) {
                    logger_1.logger.warn({ socketId: socket.id }, 'Socket failed kiosk auth for register_kiosk');
                    socket.emit('auth_error', { message: 'Invalid or missing kiosk API key' });
                    return;
                }
                if (payload.locationId && payload.spaceId) {
                    const spaceRoom = `location-${payload.locationId}-space-${payload.spaceId}`;
                    const locationRoom = `location-${payload.locationId}`;
                    socket.join(spaceRoom);
                    socket.join(locationRoom);
                    socket.data.isKiosk = true;
                    logger_1.logger.info({ socketId: socket.id, spaceId: payload.spaceId, spaceRoom, locationRoom }, 'Socket joined rooms');
                }
            });
            // Only allow booking requests from authenticated kiosk sockets
            socket.on('request_initial_bookings', (payload) => {
                if (!socket.data.isKiosk) {
                    socket.emit('auth_error', { message: 'Not authenticated as kiosk' });
                    return;
                }
                if (payload.locationId && payload.spaceId) {
                    logger_1.logger.info({ socketId: socket.id, spaceId: payload.spaceId }, 'Kiosk requested initial bookings');
                    this.sendAllBookingsUpdate(payload.locationId, payload.spaceId);
                }
            });
            // Register a kiosk/TV to a league room (requires kiosk auth)
            socket.on('register_league', (payload) => {
                if (!socket.data.isKiosk) {
                    socket.emit('auth_error', { message: 'Not authenticated as kiosk' });
                    return;
                }
                if (payload.locationId && payload.leagueId) {
                    const room = `location-${payload.locationId}-league-${payload.leagueId}`;
                    socket.join(room);
                    logger_1.logger.info({ socketId: socket.id, room }, 'Socket joined league room');
                }
            });
            // Register an employee dashboard to receive real-time updates for a location
            socket.on('register_dashboard', (payload) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const token = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token;
                if (!token) {
                    socket.emit('auth_error', { message: 'Authentication required' });
                    return;
                }
                try {
                    const { data: { user }, error } = yield database_1.supabase.auth.getUser(token);
                    if (error || !user) {
                        socket.emit('auth_error', { message: 'Invalid token' });
                        return;
                    }
                    const { data: profile } = yield database_1.supabase
                        .from('user_profiles')
                        .select('role, location_id')
                        .eq('id', user.id)
                        .single();
                    if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
                        socket.emit('auth_error', { message: 'Employee access required' });
                        return;
                    }
                    // Check location access via client_members (fallback to profile.location_id)
                    const { data: memberships } = yield database_1.supabase
                        .from('client_members')
                        .select('location_id')
                        .eq('user_id', user.id);
                    const accessibleIds = memberships && memberships.length > 0
                        ? memberships.map(m => m.location_id)
                        : (profile.location_id ? [profile.location_id] : []);
                    if (!accessibleIds.includes(payload.locationId)) {
                        socket.emit('auth_error', { message: 'Access denied for this location' });
                        return;
                    }
                    if (payload.locationId) {
                        const locationRoom = `location-${payload.locationId}`;
                        const dashboardRoom = `dashboard-${payload.locationId}`;
                        socket.join(locationRoom);
                        socket.join(dashboardRoom);
                        socket.data.isDashboard = true;
                        logger_1.logger.info({ socketId: socket.id, locationId: payload.locationId, dashboardRoom }, 'Dashboard joined location rooms');
                    }
                }
                catch (err) {
                    logger_1.logger.error({ err, socketId: socket.id }, 'Dashboard socket auth failed');
                    socket.emit('auth_error', { message: 'Authentication failed' });
                }
            }));
            socket.on('disconnect', () => {
                logger_1.logger.info({ socketId: socket.id }, 'Client disconnected');
            });
        });
    }
    /**
     * Fetches the specific booking and broadcasts it to the space kiosk.
     * @param locationId The ID of the location to update.
     * @param spaceId The ID of the specific space to update.
     * @param bookingId The specific booking that changed (optional, if not provided will send all bookings)
     */
    triggerBookingUpdate(locationId, spaceId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !spaceId)
                return;
            logger_1.logger.info({ locationId, spaceId, bookingId }, 'Triggering booking update');
            try {
                if (bookingId) {
                    // Send only the specific booking that changed
                    yield this.sendSpecificBookingUpdate(locationId, spaceId, bookingId);
                }
                else {
                    // Fallback: send all bookings (for initial load or polling)
                    yield this.sendAllBookingsUpdate(locationId, spaceId);
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, locationId, spaceId }, 'Failed to trigger booking update');
            }
        });
    }
    /**
     * Send update for a specific booking
     */
    sendSpecificBookingUpdate(locationId, spaceId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get the specific booking details
            const { data: booking, error } = yield database_1.supabase
                .from('bookings')
                .select('id, space_id, user_id, start_time, end_time, status')
                .eq('id', bookingId)
                .eq('location_id', locationId)
                .eq('space_id', spaceId)
                .single();
            if (error || !booking) {
                logger_1.logger.error({ err: error, bookingId }, 'Could not fetch booking for update');
                return;
            }
            // Get location timezone for proper time formatting
            const dateForLocation = yield this.getTodayForLocation(locationId);
            if (!dateForLocation) {
                logger_1.logger.error({ locationId }, 'Could not determine date for location, aborting broadcast');
                return;
            }
            // Format the booking time for display
            const startTimeUTC = new Date(booking.start_time);
            const endTimeUTC = new Date(booking.end_time);
            const [{ data: location }, { data: settings }] = yield Promise.all([
                database_1.supabase.from('locations').select('timezone').eq('id', locationId).single(),
                database_1.supabase.from('location_settings').select('booking_grace_period_before_minutes, booking_grace_period_after_minutes').eq('location_id', locationId).single(),
            ]);
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
            const graceBefore = ((settings === null || settings === void 0 ? void 0 : settings.booking_grace_period_before_minutes) || 0) * 60000;
            const graceAfter = ((settings === null || settings === void 0 ? void 0 : settings.booking_grace_period_after_minutes) || 0) * 60000;
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
            logger_1.logger.info({ action: payload.action, room, bookingId }, 'Broadcasted booking update');
        });
    }
    /**
     * Send all bookings for a space (fallback method)
     */
    sendAllBookingsUpdate(locationId, spaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            // We need to get the current date in the location's specific timezone
            const dateForLocation = yield this.getTodayForLocation(locationId);
            if (!dateForLocation) {
                logger_1.logger.error({ locationId }, 'Could not determine date for location, aborting broadcast');
                return;
            }
            const [bookings, { data: graceSettings }] = yield Promise.all([
                this.bookingService.getBookings(locationId, dateForLocation),
                database_1.supabase.from('location_settings').select('booking_grace_period_before_minutes, booking_grace_period_after_minutes').eq('location_id', locationId).single(),
            ]);
            const graceBefore = ((graceSettings === null || graceSettings === void 0 ? void 0 : graceSettings.booking_grace_period_before_minutes) || 0) * 60000;
            const graceAfter = ((graceSettings === null || graceSettings === void 0 ? void 0 : graceSettings.booking_grace_period_after_minutes) || 0) * 60000;
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
            logger_1.logger.info({ room, bookingCount: spaceBookings.length, spaceId, date: dateForLocation }, 'Broadcasted bookings_updated');
        });
    }
    /**
     * Gets the location's timezone from the database and returns the current date
     * formatted as 'YYYY-MM-DD'.
     * @param locationId The ID of the location.
     * @returns A date string or null if the location is not found.
     */
    getTodayForLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: location, error } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            if (error || !location) {
                logger_1.logger.error({ err: error, locationId }, 'Could not fetch timezone for location');
                return null;
            }
            // 'en-CA' gives the YYYY-MM-DD format needed by the getBookings method.
            return new Date().toLocaleDateString('en-CA', { timeZone: location.timezone });
        });
    }
    // =====================================================
    // LEAGUE REAL-TIME EVENTS
    // =====================================================
    /**
     * Broadcasts a score update to all clients in the league room.
     * Called after a player submits a score via kiosk or employee dashboard.
     */
    emitScoreUpdate(locationId, leagueId, payload) {
        const room = `location-${locationId}-league-${leagueId}`;
        this.io.to(room).emit('league_score_update', payload);
        logger_1.logger.info({ room, playerName: payload.player.displayName, holeNumber: payload.holeNumber }, 'Broadcasted league_score_update');
    }
    /**
     * Broadcasts updated standings to all clients in the league room.
     * Called after week finalization or handicap recalculation.
     */
    emitStandingsUpdate(locationId, leagueId, payload) {
        const room = `location-${locationId}-league-${leagueId}`;
        this.io.to(room).emit('league_standings_update', payload);
        logger_1.logger.info({ room, playerCount: payload.standings.length }, 'Broadcasted league_standings_update');
    }
    /**
     * Sends an unlock command to the specified kiosk and waits for a response.
     * @param locationId The ID of the location.
     * @param spaceId The ID of the space.
     * @param duration The duration in seconds for the door to remain unlocked.
     * @param bookingId The ID of the booking triggering the unlock.
     * @returns A promise that resolves to true if the unlock was successful, otherwise false.
     */
    sendUnlockCommand(locationId, spaceId, duration, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const sockets = yield this.io.in(room).fetchSockets();
                if (sockets.length === 0) {
                    logger_1.logger.error({ room }, 'No kiosk connected in room');
                    return false;
                }
                const kioskSocket = sockets[0];
                logger_1.logger.info({ kioskSocketId: kioskSocket.id, room }, 'Sending unlock command to kiosk');
                const response = yield kioskSocket.timeout(10000).emitWithAck('unlock', payload);
                if (response.success) {
                    logger_1.logger.info({ kioskSocketId: kioskSocket.id }, 'Kiosk confirmed unlock success');
                    return true;
                }
                else {
                    logger_1.logger.error({ kioskSocketId: kioskSocket.id, error: response.error }, 'Kiosk reported unlock failure');
                    return false;
                }
            }
            catch (e) {
                logger_1.logger.error({ err: e, room }, 'Did not receive unlock confirmation from room');
                return false;
            }
        });
    }
    /**
     * Broadcasts an event to all kiosks at a location.
     * Kiosks join the location-level room on registration.
     */
    broadcastToLocation(locationId, event, payload) {
        const room = `location-${locationId}`;
        this.io.to(room).emit(event, payload);
        logger_1.logger.info({ event, room }, 'Broadcasted event to room');
    }
    /**
     * Broadcast an event to a single space's room. Used by the kiosk
     * module to push settings updates and restart commands to exactly
     * the kiosk for a given bay without fanning out to the full
     * location. Room name matches the `register_kiosk` handler above.
     */
    broadcastToSpace(locationId, spaceId, event, payload) {
        const room = `location-${locationId}-space-${spaceId}`;
        this.io.to(room).emit(event, payload);
        logger_1.logger.info({ event, room }, 'Broadcasted event to space room');
    }
    /**
     * Broadcasts a space status change to all dashboards and kiosks at a location.
     */
    broadcastSpaceUpdate(locationId, space) {
        const payload = {
            type: 'space_update',
            locationId,
            space,
            timestamp: new Date().toISOString()
        };
        this.broadcastToLocation(locationId, 'space_update', payload);
        logger_1.logger.info({ locationId, spaceId: space.id, status: space.status }, 'Broadcasted space_update');
    }
    /**
     * Broadcasts when a new space is created.
     */
    broadcastSpaceCreated(locationId, space) {
        const payload = {
            type: 'space_created',
            locationId,
            space,
            timestamp: new Date().toISOString()
        };
        this.broadcastToLocation(locationId, 'space_created', payload);
        logger_1.logger.info({ locationId, spaceId: space.id }, 'Broadcasted space_created');
    }
    /**
     * Broadcasts when a space is deleted.
     */
    broadcastSpaceDeleted(locationId, spaceId) {
        const payload = {
            type: 'space_deleted',
            locationId,
            spaceId,
            timestamp: new Date().toISOString()
        };
        this.broadcastToLocation(locationId, 'space_deleted', payload);
        logger_1.logger.info({ locationId, spaceId }, 'Broadcasted space_deleted');
    }
}
exports.SocketService = SocketService;
