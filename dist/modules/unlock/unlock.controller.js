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
exports.UnlockController = void 0;
const database_1 = require("../../config/database");
const token_utils_1 = require("../../shared/utils/token.utils");
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
const location_service_1 = require("../locations/location.service");
class UnlockController {
    constructor(socketService) {
        /**
         * Employee unlock - tries each space at a location until one responds successfully
         */
        this.employeeUnlock = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { locationId } = req.body;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const doorLockType = yield location_service_1.LocationService.getDoorLockType(locationId);
                if (doorLockType === 'none') {
                    return res.status(400).json({ error: 'This location does not have an automated door lock.' });
                }
                // Get all available spaces for the location
                const { data: spaces, error: spacesError } = yield database_1.supabase
                    .from('spaces')
                    .select('id, name, space_number, status')
                    .eq('location_id', locationId)
                    .eq('status', 'available')
                    .order('space_number', { ascending: true });
                if (spacesError) {
                    logger_1.logger.error({ err: spacesError }, 'Error fetching spaces');
                    return res.status(500).json({ error: 'Failed to fetch spaces' });
                }
                if (!spaces || spaces.length === 0) {
                    return res.status(404).json({ error: 'No available spaces found for this location' });
                }
                // Extract IP address and user agent for logging
                const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
                const userAgent = req.get('User-Agent') || 'Unknown';
                const employeeId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
                // Try each space until one successfully responds
                for (const space of spaces) {
                    logger_1.logger.info({ spaceName: space.name, spaceId: space.id }, 'Attempting employee unlock on space');
                    const unlockSuccessful = yield this.socketService.sendUnlockCommand(locationId, space.id, 5, // 5 seconds unlock duration
                    `employee-unlock` // Not a real booking -- access log is created separately with booking_id: null
                    );
                    if (unlockSuccessful) {
                        // Log the successful unlock
                        yield database_1.supabase.from('access_logs').insert({
                            location_id: locationId,
                            space_id: space.id,
                            booking_id: null,
                            user_id: employeeId,
                            action: 'employee_door_unlock',
                            success: true,
                            ip_address: ipAddress,
                            user_agent: userAgent,
                            unlock_method: 'employee_dashboard',
                            metadata: {
                                space_name: space.name,
                                space_number: space.space_number
                            }
                        });
                        logger_1.logger.info({ spaceName: space.name }, 'Employee unlock successful on space');
                        return res.json({
                            success: true,
                            message: `Door unlocked successfully via ${space.name}`,
                            spaceId: space.id,
                            spaceName: space.name
                        });
                    }
                }
                // If no space responded successfully
                logger_1.logger.error({ locationId }, 'Employee unlock failed - no kiosk responded');
                return res.status(503).json({
                    success: false,
                    error: 'No kiosk responded to the unlock command. Please ensure at least one kiosk is online.'
                });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in employee unlock');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.unlockDoor = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { token } = req.query;
                if (!token || typeof token !== 'string') {
                    return res.status(400).json({ error: 'Token is required' });
                }
                const tokenData = (0, token_utils_1.verifyUnlockToken)(token);
                if (!tokenData) {
                    return res.status(400).json({ error: 'Invalid or tampered token' });
                }
                const { bookingId, expires } = tokenData;
                if (Date.now() > expires) {
                    return res.status(403).json({ error: 'Token has expired' });
                }
                // Verify booking exists and is confirmed
                const { data: booking, error: bookingError } = yield database_1.supabase
                    .from('bookings')
                    .select('id, status, space_id, location_id, user_id, start_time, end_time')
                    .eq('id', bookingId)
                    .single();
                if (bookingError || !booking) {
                    logger_1.logger.error({ err: bookingError, bookingId }, 'Booking not found');
                    return res.status(404).json({ error: 'Booking not found' });
                }
                if (booking.status !== 'confirmed') {
                    logger_1.logger.info({ bookingId, status: booking.status }, 'Booking has invalid status for unlock');
                    return res.status(403).json({ error: 'Booking is not confirmed' });
                }
                const doorLockType = yield location_service_1.LocationService.getDoorLockType(booking.location_id);
                if (doorLockType === 'none') {
                    return res.status(400).json({ error: 'This location does not have an automated door lock.' });
                }
                // Check if booking is currently active (within the time window)
                const now = new Date();
                const bookingStart = new Date(booking.start_time);
                const bookingEnd = new Date(booking.end_time);
                // Allow unlock 15 minutes before start time and up to end time
                const unlockWindow = new Date(bookingStart.getTime() - 15 * 60 * 1000);
                if (now < unlockWindow) {
                    return res.status(403).json({
                        error: 'Too early to unlock. Access available 15 minutes before your booking time.',
                        earliestAccess: unlockWindow.toISOString()
                    });
                }
                if (now > bookingEnd) {
                    return res.status(403).json({
                        error: 'Booking has ended. Access no longer available.',
                        bookingEnded: bookingEnd.toISOString()
                    });
                }
                // Extract IP address and user agent
                const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
                const userAgent = req.get('User-Agent') || 'Unknown';
                // Log the unlock attempt
                const { error: logError } = yield database_1.supabase
                    .from('access_logs')
                    .insert({
                    location_id: booking.location_id,
                    space_id: booking.space_id,
                    booking_id: bookingId,
                    user_id: booking.user_id,
                    action: 'door_unlock_button_pressed',
                    success: true,
                    ip_address: ipAddress,
                    user_agent: userAgent,
                    unlock_method: 'email_link',
                    unlock_token_used: token.slice(-8), // Last 8 characters for debugging
                    metadata: {
                        unlock_window_start: unlockWindow.toISOString(),
                        booking_start: booking.start_time,
                        booking_end: booking.end_time
                    }
                });
                if (logError) {
                    logger_1.logger.error({ err: logError }, 'Error logging unlock attempt');
                    // Don't fail the request, just log the error
                }
                // Send unlock command to kiosk via websocket
                const unlockSuccessful = yield this.socketService.sendUnlockCommand(booking.location_id, booking.space_id, 5, // 5 seconds unlock duration
                bookingId);
                if (!unlockSuccessful) {
                    logger_1.logger.error({ bookingId }, 'Unlock failed - kiosk did not confirm');
                    // Log the failure
                    yield database_1.supabase.from('access_logs').insert({
                        location_id: booking.location_id,
                        space_id: booking.space_id,
                        booking_id: bookingId,
                        user_id: booking.user_id,
                        action: 'door_unlock_failure',
                        success: false,
                        error_message: 'Kiosk did not respond or reported failure',
                        ip_address: ipAddress,
                        user_agent: userAgent,
                        unlock_method: 'email_link',
                        unlock_token_used: token.slice(-8)
                    });
                    return res.status(503).json({
                        success: false,
                        error: 'The door unlock system is currently offline or the lock is unreachable. Please try again in a moment. If the problem persists, please contact support.'
                    });
                }
                logger_1.logger.info({ bookingId }, 'Door unlock command acknowledged as successful');
                res.json({
                    success: true,
                    message: 'Access granted! The door is now unlocked.',
                    bookingId,
                    unlockDuration: 5
                });
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in unlock door');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.socketService = socketService;
    }
}
exports.UnlockController = UnlockController;
