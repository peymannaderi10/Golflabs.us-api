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
            // Register a kiosk and have it join a room based on its location
            socket.on('register_kiosk', (payload) => {
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
    triggerBookingUpdate(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId)
                return;
            console.log(`Triggering booking update for location: ${locationId}`);
            try {
                // We need to get the current date in the location's specific timezone
                const dateForLocation = yield this.getTodayForLocation(locationId);
                if (!dateForLocation) {
                    console.error(`Could not determine date for location ${locationId}, aborting broadcast.`);
                    return;
                }
                const bookings = yield this.bookingService.getBookings(locationId, dateForLocation);
                const room = `location-${locationId}`;
                this.io.to(room).emit('bookings_updated', bookings);
                console.log(`Broadcasted bookings_updated to room ${room} with ${bookings.length} bookings.`);
            }
            catch (error) {
                console.error(`Failed to trigger booking update for location ${locationId}:`, error.message);
            }
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
}
exports.SocketService = SocketService;
