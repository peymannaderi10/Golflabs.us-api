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
exports.BookingController = void 0;
const booking_service_1 = require("./booking.service");
const capacity_hold_service_1 = require("./capacity-hold.service");
const error_utils_1 = require("../../shared/utils/error.utils");
const logger_1 = require("../../shared/utils/logger");
class BookingController {
    constructor(socketService) {
        this.reserveBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                const result = yield this.bookingService.reserveBooking(Object.assign(Object.assign({}, req.body), { userId: authenticatedUserId }));
                res.status(201).json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in /bookings/reserve');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.checkAvailability = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const available = yield this.bookingService.checkSlotAvailability(bookingId);
                if (!available) {
                    return res.status(409).json({ error: 'This time slot has been booked by someone else. Please choose a different time.' });
                }
                res.json({ available: true });
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error checking availability');
                res.status(500).json({ error: 'Failed to check availability' });
            }
        });
        this.getBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, date, startTime } = req.query;
                if (!locationId || !date) {
                    return res.status(400).json({ error: 'locationId and date are required query parameters' });
                }
                const bookings = yield this.bookingService.getBookings(locationId, date, startTime);
                res.json(bookings);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in /bookings endpoint');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getCapacityHolds = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, date } = req.query;
                if (!locationId || !date) {
                    return res.status(400).json({ error: 'locationId and date are required query parameters' });
                }
                const holds = yield this.capacityHoldService.getHoldsForDate(locationId, date);
                res.json(holds);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching capacity holds');
                res.status(500).json({ error: 'Failed to fetch capacity holds' });
            }
        });
        this.getTodaysHold = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const hold = yield this.capacityHoldService.getTodaysHold(locationId);
                res.json(hold);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error fetching today\'s hold');
                res.status(500).json({ error: 'Failed to fetch today\'s hold' });
            }
        });
        this.getUserReservedBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const result = yield this.bookingService.getUserReservedBookings(userId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error, userId: req.params.userId }, 'Error in user reserved bookings endpoint');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getUserFutureBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const bookings = yield this.bookingService.getUserFutureBookings(userId);
                res.json(bookings);
            }
            catch (error) {
                logger_1.logger.error({ err: error, userId: req.params.userId }, 'Error in user future bookings endpoint');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getUserPastBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { userId } = req.params;
                const authenticatedUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                if (authenticatedUserId !== userId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const page = parseInt(req.query.page) || 1;
                const pageSize = parseInt(req.query.pageSize) || 20;
                const result = yield this.bookingService.getUserPastBookings(userId, page, pageSize);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error, userId: req.params.userId }, 'Error in user past bookings endpoint');
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.cancelBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const userId = req.user.id;
                const result = yield this.bookingService.cancelBooking(bookingId, userId);
                res.json(result);
                // After successfully cancelling, trigger a real-time update
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error cancelling booking');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // Employee-specific endpoints
        this.getEmployeeBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, startDate, endDate, date, spaceId, customerEmail } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                // Accept `date` as shorthand for startDate=date & endDate=date
                const resolvedStart = (startDate || date);
                const resolvedEnd = (endDate || date);
                const bookings = yield this.bookingService.getAllBookingsForEmployee(locationId, resolvedStart, resolvedEnd, spaceId, customerEmail);
                res.json(bookings);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in employee bookings endpoint');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.searchCustomers = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).json({ error: 'email is required' });
                }
                const customers = yield this.bookingService.searchCustomersByEmail(email);
                res.json(customers);
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in customer search endpoint');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.employeeCancelBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { reason, skipRefund } = req.body;
                const employeeProfile = req.employeeProfile;
                if (!employeeProfile) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const bookingLocationId = yield this.bookingService.getBookingLocationId(bookingId);
                if (!bookingLocationId)
                    return res.status(404).json({ error: 'Booking not found' });
                if (bookingLocationId !== employeeProfile.location_id) {
                    return res.status(403).json({ error: 'Access denied: booking belongs to a different location' });
                }
                const result = yield this.bookingService.employeeCancelBooking(bookingId, employeeProfile.id, reason, !!skipRefund);
                res.json(result);
                // Trigger socket update for real-time booking changes
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in employee cancel booking');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.cancelReservedBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const userId = req.user.id;
                const result = yield this.bookingService.cancelReservedBooking(bookingId, userId);
                res.json(result);
                // After successfully cancelling, trigger a real-time update
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error cancelling reserved booking');
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // Session extension endpoints (called by kiosk)
        this.getExtensionOptions = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const result = yield this.bookingService.getExtensionOptions(bookingId);
                res.json(result);
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error getting extension options for booking');
                if (error.message === 'Booking not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message === 'Booking has already ended' || error.message === 'Booking is not confirmed') {
                    return res.status(409).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.extendBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { extensionMinutes, locationId, spaceId, useFreeMinutes } = req.body;
                if (!extensionMinutes || !locationId || !spaceId) {
                    return res.status(400).json({ error: 'extensionMinutes, locationId, and spaceId are required' });
                }
                const result = yield this.bookingService.extendBooking(bookingId, extensionMinutes, locationId, spaceId, !!useFreeMinutes);
                res.json(result);
                // Trigger real-time update to the kiosk so countdown resets
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error extending booking');
                if (error.message === 'Booking not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message.includes('conflict') || error.message.includes('already ended') || error.message.includes('not confirmed')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
                    return res.status(402).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.employeeExtendBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { extensionMinutes, locationId, spaceId, skipPayment } = req.body;
                const employeeProfile = req.employeeProfile;
                if (!employeeProfile) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const bookingLocationId = yield this.bookingService.getBookingLocationId(bookingId);
                if (!bookingLocationId)
                    return res.status(404).json({ error: 'Booking not found' });
                if (bookingLocationId !== employeeProfile.location_id) {
                    return res.status(403).json({ error: 'Access denied: booking belongs to a different location' });
                }
                if (!extensionMinutes || !locationId || !spaceId) {
                    return res.status(400).json({ error: 'extensionMinutes, locationId, and spaceId are required' });
                }
                const result = yield this.bookingService.employeeExtendBooking(bookingId, extensionMinutes, locationId, spaceId, employeeProfile.id, skipPayment === true);
                res.json(result);
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in employee extend booking');
                if (error.message === 'Booking not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message.includes('conflict') || error.message.includes('already ended') || error.message.includes('not confirmed')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
                    return res.status(402).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.employeeRescheduleBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { startTime, endTime, locationId, spaceId, adjustPrice } = req.body;
                const employeeProfile = req.employeeProfile;
                if (!employeeProfile) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const bookingLocationId = yield this.bookingService.getBookingLocationId(bookingId);
                if (!bookingLocationId)
                    return res.status(404).json({ error: 'Booking not found' });
                if (bookingLocationId !== employeeProfile.location_id) {
                    return res.status(403).json({ error: 'Access denied: booking belongs to a different location' });
                }
                if (!startTime || !endTime || !locationId || !spaceId) {
                    return res.status(400).json({ error: 'startTime, endTime, locationId, and spaceId are required' });
                }
                const result = yield this.bookingService.employeeRescheduleBooking(bookingId, startTime, endTime, locationId, spaceId, employeeProfile.id, adjustPrice === true);
                res.json(result);
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error, bookingId: req.params.bookingId }, 'Error in employee reschedule booking');
                if (error.message === 'Booking not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message.includes('conflict') || error.message.includes('not confirmed')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
                    return res.status(402).json({ error: error.message });
                }
                res.status(500).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        // Employee create booking - bypasses Stripe payment
        this.employeeCreateBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const employeeProfile = req.employeeProfile;
                if (!employeeProfile) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const result = yield this.bookingService.createEmployeeBooking(req.body, employeeProfile.id);
                res.status(201).json(result);
                // Trigger socket update for real-time booking changes
                try {
                    if (result.locationId && result.spaceId) {
                        this.socketService.triggerBookingUpdate(result.locationId, result.spaceId, result.bookingId);
                    }
                }
                catch (socketErr) {
                    logger_1.logger.error({ err: socketErr, bookingId: result.bookingId }, 'Socket update failed (non-fatal)');
                }
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in employee create booking');
                res.status(400).json({ error: (0, error_utils_1.sanitizeError)(error) });
            }
        });
        this.bookingService = new booking_service_1.BookingService();
        this.capacityHoldService = new capacity_hold_service_1.CapacityHoldService();
        this.socketService = socketService;
    }
}
exports.BookingController = BookingController;
