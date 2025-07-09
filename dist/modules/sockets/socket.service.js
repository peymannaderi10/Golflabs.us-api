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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
const booking_service_1 = require("../bookings/booking.service");
const database_1 = require("../../config/database");
/**
 * Service to manage WebSocket connections and broadcasts.
 */
class SocketService {
    constructor(io) {
        this.io = io;
        this.bookingService = new booking_service_1.BookingService();
        console.log('SocketService initialized.');
    }
    /**
     * Initializes the socket connection handlers.
     */
    init() {
        this.io.on('connection', (socket) => {
            console.log('A client connected:', socket.id);
            // Register a kiosk and have it join a room based on its location and bay
            socket.on('register_kiosk', (payload) => {
                if (payload.locationId && payload.bayId) {
                    const room = `location-${payload.locationId}-bay-${payload.bayId}`;
                    socket.join(room);
                    console.log(`Socket ${socket.id} (Bay ${payload.bayId}) joined room: ${room}`);
                }
            });
            // Handle request from a kiosk for a full data refresh
            socket.on('request_initial_bookings', (payload) => {
                if (payload.locationId && payload.bayId) {
                    console.log(`Kiosk ${socket.id} requested initial bookings for bay ${payload.bayId}.`);
                    // Use the existing fallback method to send all bookings
                    this.sendAllBookingsUpdate(payload.locationId, payload.bayId);
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
    triggerBookingUpdate(locationId, bayId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !bayId)
                return;
            console.log(`Triggering booking update for location: ${locationId}, bay: ${bayId}${bookingId ? `, booking: ${bookingId}` : ''}`);
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
                console.error(`Failed to trigger booking update for location ${locationId}, bay ${bayId}:`, error.message);
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
            const dateForLocation = yield this.getTodayForLocation(locationId);
            if (!dateForLocation) {
                console.error(`Could not determine date for location ${locationId}, aborting broadcast.`);
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
                    startTime: startTimeLocal,
                    endTime: endTimeLocal,
                    status: booking.status
                },
                timestamp: new Date().toISOString()
            };
            const room = `location-${locationId}-bay-${bayId}`;
            this.io.to(room).emit('booking_update', payload);
            console.log(`Broadcasted ${payload.action} booking update to room ${room} for booking ${bookingId}.`);
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
                console.error(`Could not determine date for location ${locationId}, aborting broadcast.`);
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
                    startTime: booking.startTime,
                    endTime: booking.endTime,
                    status: 'confirmed' // All bookings from getBookings are confirmed
                })),
                timestamp: new Date().toISOString()
            };
            const room = `location-${locationId}-bay-${bayId}`;
            this.io.to(room).emit('bookings_updated', payload);
            console.log(`Broadcasted bookings_updated to room ${room} with ${bayBookings.length} bookings for bay ${bayId} on date ${dateForLocation}.`);
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
                console.error(`Could not fetch timezone for location ${locationId}:`, error);
                return null;
            }
            // 'en-CA' gives the YYYY-MM-DD format needed by the getBookings method.
            return new Date().toLocaleDateString('en-CA', { timeZone: location.timezone });
        });
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
                    console.error(`No kiosk connected in room: ${room}`);
                    return resolve(false);
                }
                const kioskSocket = sockets[0]; // Assuming one kiosk per room
                console.log(`Sending unlock command to kiosk ${kioskSocket.id} in room ${room}`);
                // Emit with a timeout and acknowledgment callback
                const response = yield kioskSocket.timeout(10000).emitWithAck('unlock', payload);
                if (response.success) {
                    console.log(`Kiosk ${kioskSocket.id} confirmed unlock success.`);
                    resolve(true);
                }
                else {
                    console.error(`Kiosk ${kioskSocket.id} reported unlock failure: ${response.error}`);
                    resolve(false);
                }
            }
            catch (e) {
                // This catch block handles timeout errors or other socket errors
                console.error(`Did not receive unlock confirmation from room ${room}. Error: ${e.message}`);
                resolve(false);
            }
        }));
    }
}
exports.SocketService = SocketService;
