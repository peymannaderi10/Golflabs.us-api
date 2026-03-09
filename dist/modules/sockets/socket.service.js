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
                if (payload.locationId && payload.bayId) {
                    const bayRoom = `location-${payload.locationId}-bay-${payload.bayId}`;
                    const locationRoom = `location-${payload.locationId}`;
                    socket.join(bayRoom);
                    socket.join(locationRoom);
                    socket.data.isKiosk = true;
                    logger_1.logger.info({ socketId: socket.id, bayId: payload.bayId, bayRoom, locationRoom }, 'Socket joined rooms');
                }
            });
            // Only allow booking requests from authenticated kiosk sockets
            socket.on('request_initial_bookings', (payload) => {
                if (!socket.data.isKiosk) {
                    socket.emit('auth_error', { message: 'Not authenticated as kiosk' });
                    return;
                }
                if (payload.locationId && payload.bayId) {
                    logger_1.logger.info({ socketId: socket.id, bayId: payload.bayId }, 'Kiosk requested initial bookings');
                    this.sendAllBookingsUpdate(payload.locationId, payload.bayId);
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
            socket.on('register_dashboard', (payload) => {
                if (payload.locationId) {
                    const locationRoom = `location-${payload.locationId}`;
                    const dashboardRoom = `dashboard-${payload.locationId}`;
                    socket.join(locationRoom);
                    socket.join(dashboardRoom);
                    socket.data.isDashboard = true;
                    logger_1.logger.info({ socketId: socket.id, locationId: payload.locationId, dashboardRoom }, 'Dashboard joined location rooms');
                }
            });
            socket.on('disconnect', () => {
                logger_1.logger.info({ socketId: socket.id }, 'Client disconnected');
            });
        });
    }
    /**
     * Fetches the specific booking and broadcasts it to the bay kiosk.
     * @param locationId The ID of the location to update.
     * @param bayId The ID of the specific bay to update.
     * @param bookingId The specific booking that changed (optional, if not provided will send all bookings)
     */
    triggerBookingUpdate(locationId, bayId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !bayId)
                return;
            logger_1.logger.info({ locationId, bayId, bookingId }, 'Triggering booking update');
            try {
                if (bookingId) {
                    // Send only the specific booking that changed
                    yield this.sendSpecificBookingUpdate(locationId, bayId, bookingId);
                }
                else {
                    // Fallback: send all bookings (for initial load or polling)
                    yield this.sendAllBookingsUpdate(locationId, bayId);
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, locationId, bayId }, 'Failed to trigger booking update');
            }
        });
    }
    /**
     * Send update for a specific booking
     */
    sendSpecificBookingUpdate(locationId, bayId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get the specific booking details
            const { data: booking, error } = yield database_1.supabase
                .from('bookings')
                .select('id, bay_id, user_id, start_time, end_time, status')
                .eq('id', bookingId)
                .eq('location_id', locationId)
                .eq('bay_id', bayId)
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
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
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
                    userId: booking.user_id,
                    startTime: startTimeLocal,
                    endTime: endTimeLocal,
                    status: booking.status
                },
                timestamp: new Date().toISOString()
            };
            const room = `location-${locationId}-bay-${bayId}`;
            this.io.to(room).emit('booking_update', payload);
            logger_1.logger.info({ action: payload.action, room, bookingId }, 'Broadcasted booking update');
        });
    }
    /**
     * Send all bookings for a bay (fallback method)
     */
    sendAllBookingsUpdate(locationId, bayId) {
        return __awaiter(this, void 0, void 0, function* () {
            // We need to get the current date in the location's specific timezone
            const dateForLocation = yield this.getTodayForLocation(locationId);
            if (!dateForLocation) {
                logger_1.logger.error({ locationId }, 'Could not determine date for location, aborting broadcast');
                return;
            }
            const bookings = yield this.bookingService.getBookings(locationId, dateForLocation);
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
                    userId: booking.userId,
                    startTime: booking.startTime,
                    endTime: booking.endTime,
                    status: 'confirmed' // All bookings from getBookings are confirmed
                })),
                timestamp: new Date().toISOString()
            };
            const room = `location-${locationId}-bay-${bayId}`;
            this.io.to(room).emit('bookings_updated', payload);
            logger_1.logger.info({ room, bookingCount: bayBookings.length, bayId, date: dateForLocation }, 'Broadcasted bookings_updated');
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
     * @param bayId The ID of the bay.
     * @param duration The duration in seconds for the door to remain unlocked.
     * @param bookingId The ID of the booking triggering the unlock.
     * @returns A promise that resolves to true if the unlock was successful, otherwise false.
     */
    sendUnlockCommand(locationId, bayId, duration, bookingId) {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            const room = `location-${locationId}-bay-${bayId}`;
            const payload = {
                type: 'door_unlock',
                duration,
                bookingId,
                locationId,
                bayId,
                timestamp: new Date().toISOString()
            };
            try {
                // Find sockets for the target kiosk
                const sockets = yield this.io.in(room).fetchSockets();
                if (sockets.length === 0) {
                    logger_1.logger.error({ room }, 'No kiosk connected in room');
                    return resolve(false);
                }
                const kioskSocket = sockets[0]; // Assuming one kiosk per room
                logger_1.logger.info({ kioskSocketId: kioskSocket.id, room }, 'Sending unlock command to kiosk');
                // Emit with a timeout and acknowledgment callback
                const response = yield kioskSocket.timeout(10000).emitWithAck('unlock', payload);
                if (response.success) {
                    logger_1.logger.info({ kioskSocketId: kioskSocket.id }, 'Kiosk confirmed unlock success');
                    resolve(true);
                }
                else {
                    logger_1.logger.error({ kioskSocketId: kioskSocket.id, error: response.error }, 'Kiosk reported unlock failure');
                    resolve(false);
                }
            }
            catch (e) {
                // This catch block handles timeout errors or other socket errors
                logger_1.logger.error({ err: e, room }, 'Did not receive unlock confirmation from room');
                resolve(false);
            }
        }));
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
     * Broadcasts a bay status change to all dashboards and kiosks at a location.
     */
    broadcastBayUpdate(locationId, bay) {
        const payload = {
            type: 'bay_update',
            locationId,
            bay,
            timestamp: new Date().toISOString()
        };
        this.broadcastToLocation(locationId, 'bay_update', payload);
        logger_1.logger.info({ locationId, bayId: bay.id, status: bay.status }, 'Broadcasted bay_update');
    }
    /**
     * Broadcasts when a new bay is created.
     */
    broadcastBayCreated(locationId, bay) {
        const payload = {
            type: 'bay_created',
            locationId,
            bay,
            timestamp: new Date().toISOString()
        };
        this.broadcastToLocation(locationId, 'bay_created', payload);
        logger_1.logger.info({ locationId, bayId: bay.id }, 'Broadcasted bay_created');
    }
    /**
     * Broadcasts when a bay is deleted.
     */
    broadcastBayDeleted(locationId, bayId) {
        const payload = {
            type: 'bay_deleted',
            locationId,
            bayId,
            timestamp: new Date().toISOString()
        };
        this.broadcastToLocation(locationId, 'bay_deleted', payload);
        logger_1.logger.info({ locationId, bayId }, 'Broadcasted bay_deleted');
    }
}
exports.SocketService = SocketService;
