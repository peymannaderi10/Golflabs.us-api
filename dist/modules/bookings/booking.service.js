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
exports.BookingService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const date_utils_1 = require("../../shared/utils/date.utils");
class BookingService {
    reserveBooking(bookingData) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const { locationId, userId, bayId, date, startTime, endTime, partySize, totalAmount } = bookingData;
            // Basic validation
            if (!locationId || !userId || !bayId || !date || !startTime || !endTime || !partySize || !totalAmount) {
                throw new Error('Missing required booking details');
            }
            // First, get the location's timezone
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            if (locationError || !location) {
                console.error('Error fetching location timezone:', locationError);
                throw new Error('Invalid location ID');
            }
            const timezone = location.timezone || 'America/New_York';
            // Validate that start and end times are on the same day
            const startTimeParsed = (0, date_utils_1.parseTimeString)(startTime);
            const endTimeParsed = (0, date_utils_1.parseTimeString)(endTime);
            // If end time is earlier than start time, it suggests an overnight booking
            if (endTimeParsed.hours < startTimeParsed.hours ||
                (endTimeParsed.hours === startTimeParsed.hours && endTimeParsed.minutes < startTimeParsed.minutes)) {
                throw new Error('Overnight bookings are not allowed. Please book within a single day (12am to 11:59pm).');
            }
            const p_start_time = (0, date_utils_1.createISOTimestamp)(date, startTime, timezone);
            const p_end_time = (0, date_utils_1.createISOTimestamp)(date, endTime, timezone);
            console.log(`Creating booking with timezone ${timezone}:`, {
                input: { date, startTime, endTime },
                output: { p_start_time, p_end_time }
            });
            // Set expiration time using UTC timestamp
            const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
            // Generate a temporary payment intent ID for the reservation
            const tempPaymentIntentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            // Call the PostgreSQL function to create booking and all related records
            const { data, error } = yield database_1.supabase.rpc('create_booking_and_payment_record', {
                p_location_id: locationId,
                p_user_id: userId,
                p_bay_id: bayId,
                p_start_time: p_start_time,
                p_end_time: p_end_time,
                p_party_size: partySize,
                p_total_amount: totalAmount,
                p_payment_intent_id: tempPaymentIntentId,
                p_user_agent: 'API',
                p_ip_address: '0.0.0.0'
            });
            if (error) {
                console.error('Error calling create_booking_and_payment_record function:', error);
                // Handle common database errors
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('duplicate key')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('already exists'))) {
                    throw new Error('This time slot is no longer available.');
                }
                if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('Time slot is already booked')) {
                    throw new Error('This time slot is no longer available.');
                }
                throw error;
            }
            if (!(data === null || data === void 0 ? void 0 : data.booking_id)) {
                throw new Error('Failed to create booking - no booking ID returned');
            }
            console.log(`Created new booking ${data.booking_id} for bay ${bayId} from ${p_start_time} to ${p_end_time}`);
            // Update the booking to have reserved status and set expiration
            const { error: updateError } = yield database_1.supabase
                .from('bookings')
                .update({
                status: 'reserved',
                expires_at: expiresAt
            })
                .eq('id', data.booking_id);
            if (updateError) {
                console.error('Error updating booking to reserved status:', updateError);
                throw updateError;
            }
            console.log(`Successfully reserved booking ${data.booking_id}, expires at ${expiresAt}`);
            return {
                bookingId: data.booking_id,
                expiresAt: expiresAt
            };
        });
    }
    getBookings(locationId, date) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !date) {
                throw new Error('locationId and date are required parameters');
            }
            // First, get the location's timezone
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            if (locationError || !location) {
                console.error('Error fetching location timezone:', locationError);
                throw new Error('Invalid location ID');
            }
            const timezone = location.timezone || 'America/New_York';
            // Use the same createISOTimestamp logic for consistent timezone conversion
            const startOfDayUTC = (0, date_utils_1.createISOTimestamp)(date, '12:00 AM', timezone);
            // For end of day, use 11:59:59 PM to stay within the same day
            // Since overnight bookings are not allowed, we only want bookings that START on this specific date
            const endOfDayUTC = (0, date_utils_1.createISOTimestamp)(date, '11:59 PM', timezone);
            // Add one minute to include 11:59 PM bookings but exclude midnight of next day
            const endOfDayPlusOneMinute = new Date(new Date(endOfDayUTC).getTime() + 60000).toISOString();
            console.log(`Fetching bookings for ${date} in timezone ${timezone}:`, {
                startUTC: startOfDayUTC,
                endUTC: endOfDayPlusOneMinute,
                note: 'Only bookings that START on this date will be included'
            });
            // Query bookings that START within this specific date
            const { data, error } = yield database_1.supabase
                .from('bookings')
                .select('id, bay_id, start_time, end_time, status')
                .eq('location_id', locationId)
                .gte('start_time', startOfDayUTC)
                .lt('start_time', endOfDayPlusOneMinute) // Exclude bookings that start on the next day
                .neq('status', 'cancelled')
                .neq('status', 'no_show')
                .neq('status', 'expired');
            if (error) {
                console.error('Error fetching bookings:', error);
                throw new Error('Failed to fetch bookings');
            }
            // Convert UTC timestamps back to local time for display
            const formattedBookings = data.map(booking => {
                const startTimeUTC = new Date(booking.start_time);
                const endTimeUTC = new Date(booking.end_time);
                // Convert to location timezone for display
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
                console.log(`Booking ${booking.id}: UTC ${booking.start_time} -> Local ${startTimeLocal}`);
                return {
                    id: booking.id,
                    bayId: booking.bay_id,
                    startTime: startTimeLocal,
                    endTime: endTimeLocal
                };
            });
            return formattedBookings;
        });
    }
    getUserReservedBookings(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!userId) {
                throw new Error('User ID is required');
            }
            // Get current time in UTC
            const now = new Date().toISOString();
            const { data, error } = yield database_1.supabase
                .from('bookings')
                .select('id, start_time, end_time, total_amount, status, expires_at, bay_id, location_id, bays (name, bay_number)')
                .eq('user_id', userId)
                .eq('status', 'reserved')
                .gt('expires_at', now)
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) {
                console.error('Error fetching reserved user bookings:', error);
                throw new Error('Failed to fetch reserved user bookings');
            }
            if (!data || data.length === 0) {
                return { reservation: null };
            }
            const reservation = data[0];
            const formattedReservation = {
                id: reservation.id,
                startTime: reservation.start_time,
                endTime: reservation.end_time,
                totalAmount: reservation.total_amount,
                status: reservation.status,
                expiresAt: reservation.expires_at,
                bayId: reservation.bay_id,
                locationId: reservation.location_id,
                bayName: ((_a = reservation.bays) === null || _a === void 0 ? void 0 : _a.name) || 'N/A',
                bayNumber: ((_b = reservation.bays) === null || _b === void 0 ? void 0 : _b.bay_number) || 'N/A'
            };
            return { reservation: formattedReservation };
        });
    }
    getUserFutureBookings(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            // Use current time (now) as cutoff instead of start of today
            // This ensures bookings that have already ended don't appear in "future" bookings
            const now = new Date().toISOString();
            const { data, error } = yield database_1.supabase
                .from('bookings')
                .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
                .eq('user_id', userId)
                .gte('end_time', now) // Use end_time to ensure booking hasn't finished yet
                .not('status', 'in', '("reserved","expired")')
                .order('start_time', { ascending: true });
            if (error) {
                console.error('Error fetching future user bookings:', error);
                throw new Error('Failed to fetch future user bookings');
            }
            const formattedBookings = data.map((booking) => {
                var _a, _b;
                return ({
                    id: booking.id,
                    startTime: booking.start_time,
                    endTime: booking.end_time,
                    totalAmount: booking.total_amount,
                    status: booking.status,
                    bayName: ((_a = booking.bays) === null || _a === void 0 ? void 0 : _a.name) || 'N/A',
                    bayNumber: ((_b = booking.bays) === null || _b === void 0 ? void 0 : _b.bay_number) || 'N/A'
                });
            });
            return formattedBookings;
        });
    }
    getUserPastBookings(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            // Use current time (now) as cutoff - bookings that have ended
            const now = new Date().toISOString();
            const { data, error } = yield database_1.supabase
                .from('bookings')
                .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
                .eq('user_id', userId)
                .lt('end_time', now) // Use end_time to find bookings that have finished
                .order('start_time', { ascending: false });
            if (error) {
                console.error('Error fetching past user bookings:', error);
                throw new Error('Failed to fetch past user bookings');
            }
            const formattedBookings = data.map((booking) => {
                var _a, _b;
                return ({
                    id: booking.id,
                    startTime: booking.start_time,
                    endTime: booking.end_time,
                    totalAmount: booking.total_amount,
                    status: booking.status,
                    bayName: ((_a = booking.bays) === null || _a === void 0 ? void 0 : _a.name) || 'N/A',
                    bayNumber: ((_b = booking.bays) === null || _b === void 0 ? void 0 : _b.bay_number) || 'N/A'
                });
            });
            return formattedBookings;
        });
    }
    cancelBooking(bookingId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!bookingId || !userId) {
                throw new Error('Booking ID and User ID are required');
            }
            // 1. Get the booking details
            const { data: booking, error: fetchError } = yield database_1.supabase
                .from('bookings')
                .select('id, user_id, start_time, status, total_amount')
                .eq('id', bookingId)
                .eq('user_id', userId)
                .single();
            if (fetchError || !booking) {
                throw new Error('Booking not found or access denied');
            }
            // 2. Check if booking can be cancelled
            if (booking.status === 'cancelled') {
                throw new Error('Booking is already cancelled');
            }
            if (booking.status !== 'confirmed') {
                throw new Error('Only confirmed bookings can be cancelled');
            }
            // 3. Check 24-hour policy
            const bookingStartTime = new Date(booking.start_time);
            const now = new Date();
            const hoursDifference = (bookingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursDifference < 24) {
                throw new Error(`Bookings cannot be cancelled within 24 hours of the start time. Hours remaining: ${Math.round(hoursDifference * 10) / 10}`);
            }
            // 4. Get the payment record to process refund
            const { data: payment, error: paymentError } = yield database_1.supabase
                .from('payments')
                .select('stripe_payment_intent_id, amount, status')
                .eq('booking_id', bookingId)
                .eq('status', 'succeeded')
                .single();
            if (paymentError || !payment) {
                console.warn(`No successful payment found for booking ${bookingId}, cancelling without refund`);
            }
            // 5. Process Stripe refund if payment exists
            let refundId = null;
            if (payment && payment.stripe_payment_intent_id) {
                try {
                    const refund = yield stripe_1.stripe.refunds.create({
                        payment_intent: payment.stripe_payment_intent_id,
                        reason: 'requested_by_customer',
                        metadata: {
                            booking_id: bookingId,
                            user_id: userId,
                            cancelled_at: new Date().toISOString()
                        }
                    });
                    refundId = refund.id;
                    console.log(`Refund created for booking ${bookingId}: ${refund.id}`);
                }
                catch (stripeError) {
                    console.error(`Error creating refund for booking ${bookingId}:`, stripeError);
                    throw new Error(`Failed to process refund. Please contact support. Details: ${stripeError.message}`);
                }
            }
            // 6. Update booking status to cancelled and immediately expire it
            const { error: updateBookingError } = yield database_1.supabase
                .from('bookings')
                .update({
                status: 'cancelled',
                expires_at: new Date().toISOString()
            })
                .eq('id', bookingId);
            if (updateBookingError) {
                console.error(`Error updating booking ${bookingId} to cancelled:`, updateBookingError);
                throw updateBookingError;
            }
            console.log(`Booking ${bookingId} cancelled and time slot freed for new reservations`);
            // 7. Update payment status if refund was processed
            if (payment && refundId) {
                const { error: updatePaymentError } = yield database_1.supabase
                    .from('payments')
                    .update({
                    status: 'refunded',
                    refund_amount: payment.amount,
                    refunded_at: new Date().toISOString()
                })
                    .eq('booking_id', bookingId);
                if (updatePaymentError) {
                    console.error(`Error updating payment status for booking ${bookingId}:`, updatePaymentError);
                    // Don't fail the request since booking was already cancelled and refund was processed
                }
            }
            // 8. Create cancellation record
            const { error: cancellationError } = yield database_1.supabase
                .from('booking_cancellations')
                .insert({
                booking_id: bookingId,
                cancelled_by: userId,
                cancellation_reason: 'Customer requested cancellation',
                cancellation_fee: 0,
                refund_amount: payment ? payment.amount : 0,
                cancelled_at: new Date().toISOString()
            });
            if (cancellationError) {
                console.error(`Error creating cancellation record for booking ${bookingId}:`, cancellationError);
            }
            return {
                success: true,
                bookingId,
                refundId,
                message: refundId ? 'Booking cancelled and refund processed' : 'Booking cancelled'
            };
        });
    }
}
exports.BookingService = BookingService;
