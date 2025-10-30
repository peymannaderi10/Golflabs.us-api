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
                const { locationId, date, bayId, customerEmail } = req.query;
                if (!locationId) {
                    return res.status(400).json({ error: 'locationId is required' });
                }
                const bookings = yield this.bookingService.getAllBookingsForEmployee(locationId, date, bayId, customerEmail);
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
        this.bookingService = new booking_service_1.BookingService();
        this.socketService = socketService;
    }
}
exports.BookingController = BookingController;
