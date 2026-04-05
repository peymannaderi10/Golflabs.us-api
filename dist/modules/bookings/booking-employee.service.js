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
exports.BookingEmployeeService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const date_utils_1 = require("../../shared/utils/date.utils");
const email_service_1 = require("../email/email.service");
const notification_service_1 = require("../email/notification.service");
const resend_1 = require("../../config/resend");
const token_utils_1 = require("../../shared/utils/token.utils");
const pricing_utils_1 = require("../../shared/utils/pricing.utils");
const logger_1 = require("../../shared/utils/logger");
const location_service_1 = require("../locations/location.service");
class BookingEmployeeService {
    getAllBookingsForEmployee(locationId, startDate, endDate, spaceId, customerEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = database_1.supabase
                .from('bookings')
                .select(`
        *,
        user_profiles(id, email, full_name, phone),
        spaces(id, name, space_number),
        payments(id, amount, status, stripe_payment_intent_id, refund_amount, refunded_at),
        booking_cancellations(cancelled_by, cancellation_reason, refund_amount, cancelled_at)
      `)
                .eq('location_id', locationId)
                .in('status', ['confirmed', 'cancelled']); // Only show actual reservations; exclude expired/abandoned
            if (startDate || endDate) {
                // Get the location's timezone first
                const { data: location } = yield database_1.supabase
                    .from('locations')
                    .select('timezone')
                    .eq('id', locationId)
                    .single();
                const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
                // Use overlap filtering so cross-midnight bookings appear on both dates
                if (startDate) {
                    const startOfRange = (0, date_utils_1.createISOTimestamp)(startDate, '12:00 AM', timezone);
                    query = query.gt('end_time', startOfRange);
                }
                if (endDate) {
                    const endOfRange = (0, date_utils_1.createISOTimestamp)(endDate, '11:59 PM', timezone);
                    const endOfRangePlusOneMinute = new Date(new Date(endOfRange).getTime() + 60000).toISOString();
                    query = query.lt('start_time', endOfRangePlusOneMinute);
                }
            }
            if (spaceId) {
                query = query.eq('space_id', spaceId);
            }
            const { data, error } = yield query.order('start_time', { ascending: true }).limit(500);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching bookings for employee');
                throw error;
            }
            // Filter by customer email if provided (done in memory since we need to join)
            let filteredData = data || [];
            if (customerEmail) {
                filteredData = filteredData.filter(booking => { var _a, _b; return (_b = (_a = booking.user_profiles) === null || _a === void 0 ? void 0 : _a.email) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(customerEmail.toLowerCase()); });
            }
            return filteredData;
        });
    }
    searchCustomersByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!email || email.length < 3) {
                throw new Error('Email search requires at least 3 characters');
            }
            const { data, error } = yield database_1.supabase
                .from('user_profiles')
                .select('id, email, full_name, phone')
                .ilike('email', `%${email}%`)
                .is('deleted_at', null)
                .order('email')
                .limit(20);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error searching customers');
                throw error;
            }
            return data;
        });
    }
    createEmployeeBooking(bookingData, employeeId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const { locationId, spaceId, date, startTime, endTime, partySize, totalAmount, notes, userId, newCustomer } = bookingData;
            // Validation
            if (!locationId || !spaceId || !date || !startTime || !endTime) {
                throw new Error('Missing required booking details');
            }
            if (!userId && !newCustomer) {
                throw new Error('Either userId or newCustomer details must be provided');
            }
            if (newCustomer && (!newCustomer.email || !newCustomer.fullName)) {
                throw new Error('New customer must have email and fullName');
            }
            // Get location timezone
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            if (locationError || !location) {
                logger_1.logger.error({ err: locationError }, 'Error fetching location timezone');
                throw new Error('Invalid location ID');
            }
            const timezone = location.timezone || 'America/New_York';
            // Create timestamps
            const p_start_time = (0, date_utils_1.createISOTimestamp)(date, startTime, timezone);
            const p_end_time = (0, date_utils_1.createISOTimestamp)(date, endTime, timezone);
            logger_1.logger.info({ timezone, date, startTime, endTime, p_start_time, p_end_time, employeeId }, 'Employee creating booking');
            // Determine the customer user ID
            let customerUserId = userId;
            // If new customer, create the user profile first
            if (newCustomer && !userId) {
                // Check if email already exists
                const { data: existingUser } = yield database_1.supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('email', newCustomer.email.toLowerCase())
                    .single();
                if (existingUser) {
                    // Use existing user
                    customerUserId = existingUser.id;
                    logger_1.logger.info({ customerUserId }, 'Found existing user for booking');
                }
                else {
                    // Create a new user profile without auth (walk-in customer)
                    const newUserId = crypto.randomUUID();
                    const { data: createdUser, error: createUserError } = yield database_1.supabase
                        .from('user_profiles')
                        .insert({
                        id: newUserId,
                        email: newCustomer.email.toLowerCase(),
                        full_name: newCustomer.fullName,
                        phone: newCustomer.phone || null,
                        role: 'customer'
                    })
                        .select('id')
                        .single();
                    if (createUserError) {
                        logger_1.logger.error({ err: createUserError }, 'Error creating new customer');
                        throw new Error('Failed to create customer profile');
                    }
                    customerUserId = createdUser.id;
                    logger_1.logger.info({ customerUserId }, 'Created new customer profile');
                }
            }
            if (!customerUserId) {
                throw new Error('Failed to determine customer ID');
            }
            // Fetch booking buffer for this location
            const { data: bufferRow } = yield database_1.supabase
                .from('location_settings')
                .select('booking_buffer_minutes')
                .eq('location_id', locationId)
                .single();
            const bufferMinutes = (_a = bufferRow === null || bufferRow === void 0 ? void 0 : bufferRow.booking_buffer_minutes) !== null && _a !== void 0 ? _a : 0;
            // Widen the query window by the buffer so we catch bookings whose
            // end_time + buffer overlaps our start. Filter precisely in code.
            const windowStart = new Date(new Date(p_start_time).getTime() - bufferMinutes * 60000).toISOString();
            const { data: conflictingBookings, error: conflictError } = yield database_1.supabase
                .from('bookings')
                .select('id, start_time, end_time')
                .eq('space_id', spaceId)
                .not('status', 'in', '("cancelled","expired","abandoned")')
                .or(`and(start_time.lt.${p_end_time},end_time.gt.${windowStart})`);
            if (conflictError) {
                logger_1.logger.error({ err: conflictError }, 'Error checking for conflicts');
                throw new Error('Failed to check booking availability');
            }
            const hasConflict = conflictingBookings === null || conflictingBookings === void 0 ? void 0 : conflictingBookings.some(b => {
                const bStart = new Date(b.start_time).getTime();
                const bEndWithBuffer = new Date(b.end_time).getTime() + bufferMinutes * 60000;
                const newStart = new Date(p_start_time).getTime();
                const newEnd = new Date(p_end_time).getTime();
                return bStart < newEnd && bEndWithBuffer > newStart;
            });
            if (hasConflict) {
                throw new Error('This time slot is no longer available');
            }
            // Create the booking with 'confirmed' status (no payment record created)
            const { data: booking, error: bookingError } = yield database_1.supabase
                .from('bookings')
                .insert({
                location_id: locationId,
                user_id: customerUserId,
                space_id: spaceId,
                start_time: p_start_time,
                end_time: p_end_time,
                party_size: partySize,
                total_amount: totalAmount,
                status: 'confirmed', // Directly confirmed - no payment record created
                notes: notes || null,
                payment_intent_id: null // No payment intent for employee-created bookings
            })
                .select('id')
                .single();
            if (bookingError) {
                logger_1.logger.error({ err: bookingError }, 'Error creating booking');
                if (((_b = bookingError.message) === null || _b === void 0 ? void 0 : _b.includes('duplicate')) || ((_c = bookingError.message) === null || _c === void 0 ? void 0 : _c.includes('already exists'))) {
                    throw new Error('This time slot is no longer available');
                }
                throw new Error('Failed to create booking');
            }
            const bookingId = booking.id;
            logger_1.logger.info({ employeeId, bookingId }, 'Employee created booking (no payment record created)');
            // Send thank you email notification (always sent immediately, same as normal booking flow)
            try {
                yield email_service_1.EmailService.sendThankYouEmail(bookingId);
                logger_1.logger.info({ bookingId }, 'Queued thank you email for employee-created booking');
            }
            catch (emailError) {
                logger_1.logger.error({ err: emailError, bookingId }, 'Error queuing thank you email for booking');
                // Don't fail the booking creation if email fails
            }
            // Check if booking starts within 15 minutes - if so, send reminder immediately (same as normal booking flow)
            try {
                const now = new Date();
                const bookingStart = new Date(p_start_time);
                const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);
                logger_1.logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Employee-created booking start time check');
                if (minutesUntilStart <= 15) {
                    logger_1.logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Employee-created booking starts soon, sending immediate reminder');
                    const doorLockType = yield location_service_1.LocationService.getDoorLockType(locationId);
                    let unlockToken = '';
                    let unlockLink = '';
                    if (doorLockType !== 'none') {
                        unlockToken = (0, token_utils_1.createUnlockToken)(bookingId, p_start_time, p_end_time);
                        unlockLink = `${resend_1.resendConfig.frontendUrl}/unlock?token=${unlockToken}`;
                        const { error: tokenUpdateError } = yield database_1.supabase
                            .from('bookings')
                            .update({
                            unlock_token: unlockToken,
                            unlock_token_expires_at: p_end_time
                        })
                            .eq('id', bookingId);
                        if (tokenUpdateError) {
                            logger_1.logger.error({ err: tokenUpdateError, bookingId }, 'Error updating unlock token for booking');
                        }
                    }
                    yield email_service_1.EmailService.sendReminderEmail(bookingId, unlockToken, unlockLink);
                    logger_1.logger.info({ bookingId, doorLockType }, 'Sent immediate reminder email for employee-created booking');
                }
                else {
                    // Booking starts later - unlock token and reminder email will be sent by the reminder job
                    logger_1.logger.info({ bookingId }, 'Employee-created booking starts later, reminder will be sent by reminder job');
                }
            }
            catch (reminderError) {
                logger_1.logger.error({ err: reminderError, bookingId }, 'Error handling reminder for employee-created booking');
                // Don't fail the booking creation if reminder handling fails
            }
            // Create audit log entry
            const { error: auditError } = yield database_1.supabase
                .from('audit_logs')
                .insert({
                location_id: locationId,
                table_name: 'bookings',
                record_id: bookingId,
                action: 'employee_created_booking',
                old_values: null,
                new_values: {
                    booking_id: bookingId,
                    space_id: spaceId,
                    customer_id: customerUserId,
                    start_time: p_start_time,
                    end_time: p_end_time,
                    total_amount: totalAmount,
                    party_size: partySize,
                    notes: notes || null,
                    new_customer_created: !userId && !!newCustomer
                },
                user_id: employeeId,
                timestamp: new Date().toISOString()
            });
            if (auditError) {
                logger_1.logger.error({ err: auditError }, 'Error creating audit log');
                // Don't fail the booking, just log the error
            }
            // Get the created booking with full details
            const { data: fullBooking, error: fetchError } = yield database_1.supabase
                .from('bookings')
                .select(`
        *,
        user_profiles(id, email, full_name, phone),
        spaces(id, name, space_number)
      `)
                .eq('id', bookingId)
                .single();
            if (fetchError) {
                logger_1.logger.error({ err: fetchError }, 'Error fetching created booking');
            }
            return {
                success: true,
                bookingId,
                locationId,
                spaceId,
                booking: fullBooking || { id: bookingId },
                message: 'Booking created successfully by employee'
            };
        });
    }
    employeeRescheduleBooking(bookingId_1, newStartTime_1, newEndTime_1, locationId_1, spaceId_1, employeeId_1) {
        return __awaiter(this, arguments, void 0, function* (bookingId, newStartTime, newEndTime, locationId, spaceId, employeeId, adjustPrice = false) {
            var _a;
            if (!bookingId || !newStartTime || !newEndTime || !locationId || !spaceId) {
                throw new Error('bookingId, newStartTime, newEndTime, locationId, and spaceId are required');
            }
            const newStart = new Date(newStartTime);
            const newEnd = new Date(newEndTime);
            if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
                throw new Error('Invalid start or end time');
            }
            if (newEnd <= newStart) {
                throw new Error('End time must be after start time');
            }
            // 1. Fetch and validate the booking
            const { data: booking, error: bookingError } = yield database_1.supabase
                .from('bookings')
                .select('id, location_id, space_id, user_id, start_time, end_time, status, total_amount')
                .eq('id', bookingId)
                .single();
            if (bookingError || !booking) {
                throw new Error('Booking not found');
            }
            if (booking.status !== 'confirmed') {
                throw new Error('Booking is not confirmed');
            }
            if (booking.location_id !== locationId) {
                throw new Error('Booking does not match the specified location');
            }
            // 2. Check for conflicts on the target bay (buffer-aware), excluding this booking
            const { data: bufferRow } = yield database_1.supabase
                .from('location_settings')
                .select('booking_buffer_minutes')
                .eq('location_id', locationId)
                .single();
            const bufferMins = (_a = bufferRow === null || bufferRow === void 0 ? void 0 : bufferRow.booking_buffer_minutes) !== null && _a !== void 0 ? _a : 0;
            const newStartWithBuffer = new Date(newStart.getTime() - bufferMins * 60000);
            const newEndWithBuffer = new Date(newEnd.getTime() + bufferMins * 60000);
            const { data: conflicts, error: conflictError } = yield database_1.supabase
                .from('bookings')
                .select('id')
                .eq('space_id', spaceId)
                .neq('id', bookingId)
                .not('status', 'in', '("cancelled","expired","abandoned")')
                .lt('start_time', newEndWithBuffer.toISOString())
                .gt('end_time', newStartWithBuffer.toISOString());
            if (conflictError) {
                throw new Error('Failed to check availability');
            }
            if (conflicts && conflicts.length > 0) {
                throw new Error('New time conflicts with another booking');
            }
            // 3. Handle price adjustment if requested
            const originalStartTime = booking.start_time;
            const originalEndTime = booking.end_time;
            const currentTotalDollars = booking.total_amount || 0;
            let newTotalDollars = currentTotalDollars;
            let priceAdjustment = { type: 'none', amountCents: 0, amountWithTaxCents: 0 };
            const reschedStripeOpts = yield (0, stripe_1.getStripeOptions)(locationId);
            if (adjustPrice) {
                // Get location timezone and tax rate
                const { data: locationData } = yield database_1.supabase
                    .from('locations')
                    .select('timezone, sales_tax_rate')
                    .eq('id', locationId)
                    .single();
                const timezone = (locationData === null || locationData === void 0 ? void 0 : locationData.timezone) || 'America/New_York';
                const taxRate = parseFloat(locationData === null || locationData === void 0 ? void 0 : locationData.sales_tax_rate) || 0;
                // Calculate new price using pricing rules
                const ctx = yield (0, pricing_utils_1.fetchPricingContext)(locationId, booking.user_id);
                const { userTypeRules, defaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, false);
                const newPriceCents = (0, pricing_utils_1.calculateSlotTotal)(newStart, newEnd, timezone, userTypeRules, defaultRules);
                const newPriceDollars = newPriceCents / 100;
                const diffDollars = newPriceDollars - currentTotalDollars;
                const diffCents = Math.round(Math.abs(diffDollars) * 100);
                const diffWithTaxCents = Math.round(diffCents * (1 + taxRate));
                if (diffDollars > 0.01) {
                    // New time is more expensive — try to charge the difference
                    priceAdjustment = { type: 'charge', amountCents: diffCents, amountWithTaxCents: diffWithTaxCents };
                    // Check if customer has a card on file
                    let hasCard = false;
                    let customerId = null;
                    let paymentMethodId = null;
                    let cardDetails = null;
                    try {
                        const resolved = yield (0, stripe_1.getOrCreateCustomerForLocation)(booking.user_id, locationId);
                        customerId = resolved.customerId;
                    }
                    catch (custErr) {
                        logger_1.logger.warn({ err: custErr, userId: booking.user_id, locationId }, 'Could not resolve Stripe customer for reschedule charge — falling back to collect_manually');
                    }
                    if (customerId) {
                        const paymentMethods = yield stripe_1.stripe.paymentMethods.list({
                            customer: customerId,
                            type: 'card',
                            limit: 1
                        }, reschedStripeOpts);
                        if (paymentMethods.data && paymentMethods.data.length > 0) {
                            hasCard = true;
                            paymentMethodId = paymentMethods.data[0].id;
                            cardDetails = paymentMethods.data[0].card;
                        }
                    }
                    if (hasCard && customerId && paymentMethodId) {
                        // Charge the saved card
                        let paymentIntent;
                        try {
                            paymentIntent = yield stripe_1.stripe.paymentIntents.create({
                                amount: diffWithTaxCents,
                                currency: 'usd',
                                customer: customerId,
                                payment_method: paymentMethodId,
                                off_session: true,
                                confirm: true,
                                metadata: {
                                    booking_id: bookingId,
                                    user_id: booking.user_id,
                                    space_id: spaceId,
                                    location_id: locationId,
                                    reschedule: 'true',
                                    price_adjustment: 'charge',
                                    pretax_amount_cents: diffCents.toString(),
                                    tax_rate: taxRate.toString(),
                                    initiated_by: 'employee',
                                    employee_id: employeeId
                                }
                            }, reschedStripeOpts);
                        }
                        catch (stripeError) {
                            logger_1.logger.error({ err: stripeError, bookingId }, 'Reschedule price adjustment charge failed');
                            throw new Error('Payment failed: ' + stripeError.message);
                        }
                        yield database_1.supabase.from('payments').insert({
                            booking_id: bookingId,
                            amount: diffWithTaxCents / 100,
                            status: 'succeeded',
                            stripe_payment_intent_id: paymentIntent.id,
                            currency: 'usd',
                            user_id: booking.user_id,
                            location_id: locationId,
                            payment_method: 'card',
                            card_last_four: (cardDetails === null || cardDetails === void 0 ? void 0 : cardDetails.last4) || null,
                            card_brand: (cardDetails === null || cardDetails === void 0 ? void 0 : cardDetails.brand) || null,
                            processed_at: new Date().toISOString()
                        });
                    }
                    else {
                        // Manual booking — no card on file, flag as collect manually
                        priceAdjustment = Object.assign(Object.assign({}, priceAdjustment), { type: 'collect_manually' });
                        logger_1.logger.info({ bookingId, diffWithTaxCents }, 'No card on file, price difference must be collected manually');
                    }
                    newTotalDollars = newPriceDollars;
                }
                else if (diffDollars < -0.01) {
                    // New time is cheaper — refund the difference
                    priceAdjustment = { type: 'refund', amountCents: diffCents, amountWithTaxCents: diffWithTaxCents };
                    const { data: payment } = yield database_1.supabase
                        .from('payments')
                        .select('stripe_payment_intent_id, amount')
                        .eq('booking_id', bookingId)
                        .eq('status', 'succeeded')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (payment && payment.stripe_payment_intent_id && !payment.stripe_payment_intent_id.startsWith('temp_')) {
                        try {
                            yield stripe_1.stripe.refunds.create({
                                payment_intent: payment.stripe_payment_intent_id,
                                amount: diffWithTaxCents,
                                metadata: {
                                    booking_id: bookingId,
                                    reschedule: 'true',
                                    price_adjustment: 'refund',
                                    pretax_amount_cents: diffCents.toString(),
                                    tax_rate: taxRate.toString(),
                                    employee_id: employeeId
                                }
                            }, reschedStripeOpts);
                            yield database_1.supabase
                                .from('payments')
                                .update({
                                refund_amount: diffWithTaxCents / 100,
                                refunded_at: new Date().toISOString()
                            })
                                .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);
                            logger_1.logger.info({ bookingId, refundAmountCents: diffWithTaxCents }, 'Reschedule partial refund processed');
                        }
                        catch (stripeError) {
                            logger_1.logger.error({ err: stripeError, bookingId }, 'Reschedule refund failed');
                            // Don't fail the reschedule — just log it
                        }
                    }
                    newTotalDollars = newPriceDollars;
                }
            }
            // 4. Update the booking times, price, and clear the old unlock token
            const { error: updateError } = yield database_1.supabase
                .from('bookings')
                .update({
                start_time: newStart.toISOString(),
                end_time: newEnd.toISOString(),
                space_id: spaceId,
                total_amount: newTotalDollars,
                unlock_token: null,
                unlock_token_expires_at: null,
                updated_at: new Date().toISOString(),
            })
                .eq('id', bookingId);
            if (updateError) {
                logger_1.logger.error({ err: updateError, bookingId }, 'Error rescheduling booking');
                throw new Error('Failed to reschedule booking');
            }
            // 5. Delete old reminder notification so the job re-queues at the new time
            yield notification_service_1.NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');
            // 6. Send booking time changed email
            yield email_service_1.EmailService.sendBookingTimeChangedEmail(bookingId);
            // 7. Log the reschedule
            yield database_1.supabase.from('access_logs').insert({
                location_id: locationId,
                space_id: spaceId,
                booking_id: bookingId,
                user_id: booking.user_id,
                action: 'booking_rescheduled',
                success: true,
                user_agent: 'Employee Dashboard',
                metadata: {
                    original_start_time: originalStartTime,
                    original_end_time: originalEndTime,
                    new_start_time: newStart.toISOString(),
                    new_end_time: newEnd.toISOString(),
                    employee_id: employeeId,
                    adjust_price: adjustPrice,
                    price_adjustment: priceAdjustment.type,
                    adjustment_amount_cents: priceAdjustment.amountWithTaxCents,
                    old_total: currentTotalDollars,
                    new_total: newTotalDollars
                }
            });
            logger_1.logger.info({
                employeeId, bookingId,
                originalStart: originalStartTime, originalEnd: originalEndTime,
                newStart: newStart.toISOString(), newEnd: newEnd.toISOString(),
                adjustPrice, priceAdjustment: priceAdjustment.type,
                adjustmentCents: priceAdjustment.amountWithTaxCents,
                oldTotal: currentTotalDollars, newTotal: newTotalDollars
            }, 'Employee rescheduled booking');
            return {
                success: true,
                bookingId,
                locationId,
                spaceId,
                newStartTime: newStart.toISOString(),
                newEndTime: newEnd.toISOString(),
                priceAdjusted: adjustPrice && priceAdjustment.type !== 'none',
                adjustmentType: priceAdjustment.type,
                adjustmentAmount: priceAdjustment.amountWithTaxCents / 100,
                newTotal: newTotalDollars,
            };
        });
    }
}
exports.BookingEmployeeService = BookingEmployeeService;
