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
class BookingController {
    constructor(socketService) {
        this.reserveBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.bookingService.reserveBooking(req.body);
                res.status(201).json(result);
            }
            catch (error) {
                console.error("Error in /bookings/reserve:", error);
                res.status(500).json({ error: error.message });
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
                console.error('Error in /bookings endpoint:', error);
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
                console.error('Error fetching capacity holds:', error);
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
                console.error('Error fetching today\'s hold:', error);
                res.status(500).json({ error: 'Failed to fetch today\'s hold' });
            }
        });
        this.getUserReservedBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                const result = yield this.bookingService.getUserReservedBookings(userId);
                res.json(result);
            }
            catch (error) {
                console.error(`Error in /users/${req.params.userId}/bookings/reserved endpoint:`, error);
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getUserFutureBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                const bookings = yield this.bookingService.getUserFutureBookings(userId);
                res.json(bookings);
            }
            catch (error) {
                console.error(`Error in /users/${req.params.userId}/bookings/future endpoint:`, error);
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.getUserPastBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = req.params;
                const bookings = yield this.bookingService.getUserPastBookings(userId);
                res.json(bookings);
            }
            catch (error) {
                console.error(`Error in /users/${req.params.userId}/bookings/past endpoint:`, error);
                res.status(500).json({ error: 'An unexpected error occurred' });
            }
        });
        this.cancelBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { userId } = req.body;
                const result = yield this.bookingService.cancelBooking(bookingId, userId);
                res.json(result);
                // After successfully cancelling, trigger a real-time update
                if (result.locationId && result.bayId) {
                    this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
                }
            }
            catch (error) {
                console.error(`Error cancelling booking ${req.params.bookingId}:`, error);
                res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
            }
        });
        // Employee-specific endpoints
        this.getEmployeeBookings = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { locationId, startDate, endDate, bayId, customerEmail } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const bookings = yield this.bookingService.getAllBookingsForEmployee(locationId, startDate, endDate, bayId, customerEmail);
                res.json(bookings);
            }
            catch (error) {
                console.error('Error in employee bookings endpoint:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.searchCustomers = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { email, locationId } = req.query;
                if (!email || !locationId) {
                    return res.status(400).json({ error: 'email and locationId are required' });
                }
                const customers = yield this.bookingService.searchCustomersByEmail(email, locationId);
                res.json(customers);
            }
            catch (error) {
                console.error('Error in customer search endpoint:', error);
                res.status(500).json({ error: error.message });
            }
        });
        this.employeeCancelBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { reason } = req.body;
                const employeeProfile = req.employeeProfile;
                if (!employeeProfile) {
                    return res.status(403).json({ error: 'Employee authentication required' });
                }
                const result = yield this.bookingService.employeeCancelBooking(bookingId, employeeProfile.id, reason);
                res.json(result);
                // Trigger socket update for real-time booking changes
                if (result.locationId && result.bayId) {
                    this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
                }
            }
            catch (error) {
                console.error(`Error in employee cancel booking ${req.params.bookingId}:`, error);
                res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
            }
        });
        this.cancelReservedBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { userId } = req.body;
                const result = yield this.bookingService.cancelReservedBooking(bookingId, userId);
                res.json(result);
                // After successfully cancelling, trigger a real-time update
                if (result.locationId && result.bayId) {
                    this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
                }
            }
            catch (error) {
                console.error(`Error cancelling reserved booking ${req.params.bookingId}:`, error);
                res.status(500).json({ error: 'Failed to cancel reservation', details: error.message });
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
                console.error(`Error getting extension options for booking ${req.params.bookingId}:`, error);
                if (error.message === 'Booking not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message === 'Booking has already ended' || error.message === 'Booking is not confirmed') {
                    return res.status(409).json({ error: error.message });
                }
                res.status(500).json({ error: error.message || 'Failed to get extension options' });
            }
        });
        this.extendBooking = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { bookingId } = req.params;
                const { extensionMinutes, locationId, bayId } = req.body;
                if (!extensionMinutes || !locationId || !bayId) {
                    return res.status(400).json({ error: 'extensionMinutes, locationId, and bayId are required' });
                }
                const result = yield this.bookingService.extendBooking(bookingId, extensionMinutes, locationId, bayId);
                res.json(result);
                // Trigger real-time update to the kiosk so countdown resets
                if (result.locationId && result.bayId) {
                    this.socketService.triggerBookingUpdate(result.locationId, result.bayId, bookingId);
                }
            }
            catch (error) {
                console.error(`Error extending booking ${req.params.bookingId}:`, error);
                if (error.message === 'Booking not found') {
                    return res.status(404).json({ error: error.message });
                }
                if (error.message.includes('conflict') || error.message.includes('already ended') || error.message.includes('not confirmed')) {
                    return res.status(409).json({ error: error.message });
                }
                if (error.message.includes('Payment failed') || error.message.includes('No payment method') || error.message.includes('No saved card')) {
                    return res.status(402).json({ error: error.message });
                }
                res.status(500).json({ error: error.message || 'Failed to extend booking' });
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
                if (result.locationId && result.bayId) {
                    this.socketService.triggerBookingUpdate(result.locationId, result.bayId, result.bookingId);
                }
            }
            catch (error) {
                console.error('Error in employee create booking:', error);
                res.status(400).json({ error: error.message || 'Failed to create booking' });
            }
        });
        this.bookingService = new booking_service_1.BookingService();
        this.capacityHoldService = new capacity_hold_service_1.CapacityHoldService();
        this.socketService = socketService;
    }
}
exports.BookingController = BookingController;
