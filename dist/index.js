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
const express_1 = __importDefault(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("@supabase/supabase-js");
dotenv_1.default.config();
// =====================================================
// INITIALIZATION
// =====================================================
// Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
    console.error("Stripe secret key not found. Make sure you have a .env file with STRIPE_SECRET_KEY set.");
    process.exit(1);
}
const stripe = new stripe_1.default(stripeSecretKey);
// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase credentials not found. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4242;
// =====================================================
// MIDDLEWARE
// =====================================================
// Use cors before the webhook route
app.use((0, cors_1.default)());
// Stripe webhook endpoint needs raw body
app.post('/stripe-webhook', express_1.default.raw({ type: 'application/json' }), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error("Stripe webhook secret not found.");
        return res.status(400).send('Webhook Error: Missing secret');
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    // Handle the event based on type
    switch (event.type) {
        case 'payment_intent.succeeded':
        case 'payment_intent.canceled':
        case 'payment_intent.payment_failed':
            const paymentIntent = event.data.object;
            const bookingId = paymentIntent.metadata.booking_id;
            if (!bookingId) {
                console.warn(`Webhook received for event ${event.type} with no booking_id in metadata.`);
                return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
            }
            if (event.type === 'payment_intent.succeeded') {
                console.log(`Payment succeeded for booking ID: ${bookingId}. Updating database...`);
                // Update booking status to 'confirmed' and clear expiration
                const { error: bookingError } = yield supabase
                    .from('bookings')
                    .update({ status: 'confirmed', expires_at: null })
                    .eq('id', bookingId);
                // Update payment status to 'succeeded'
                const { error: paymentError } = yield supabase
                    .from('payments')
                    .update({ status: 'succeeded', processed_at: new Date().toISOString() })
                    .eq('stripe_payment_intent_id', paymentIntent.id);
                if (bookingError || paymentError) {
                    console.error(`Error updating database after payment for booking ${bookingId}:`, bookingError || paymentError);
                }
                else {
                    console.log(`Successfully updated booking ${bookingId} to confirmed.`);
                }
            }
            else if (event.type === 'payment_intent.canceled') {
                console.log(`Payment canceled for booking ID: ${bookingId}. Updating database...`);
                // Update booking status to 'cancelled'
                const { error: cancelBookingError } = yield supabase
                    .from('bookings')
                    .update({ status: 'cancelled' })
                    .eq('id', bookingId)
                    .neq('status', 'confirmed'); // Don't cancel a booking that is already confirmed
                // Update payment status to 'cancelled'
                const { error: cancelPaymentError } = yield supabase
                    .from('payments')
                    .update({ status: 'cancelled' })
                    .eq('stripe_payment_intent_id', paymentIntent.id);
                if (cancelBookingError || cancelPaymentError) {
                    console.error(`Error updating database after payment cancellation for booking ${bookingId}:`, cancelBookingError || cancelPaymentError);
                }
                else {
                    console.log(`Successfully updated booking ${bookingId} to cancelled.`);
                }
            }
            else if (event.type === 'payment_intent.payment_failed') {
                console.log(`Payment failed for booking ID: ${bookingId}.`);
                // Update payment record to failed. The booking remains 'reserved' until it expires.
                const { error: paymentFailedError } = yield supabase
                    .from('payments')
                    .update({ status: 'failed' })
                    .eq('stripe_payment_intent_id', paymentIntent.id);
                if (paymentFailedError) {
                    console.error(`Error updating payment status to failed for booking ${bookingId}:`, paymentFailedError);
                }
            }
            break;
        // Refund webhook handlers
        case 'charge.dispute.created':
            const dispute = event.data.object;
            const chargeId = dispute.charge;
            console.log(`Dispute created for charge ${chargeId}. Handling dispute...`);
            // Find the payment record by charge ID (you may need to store charge_id in payments table)
            // For now, we'll log this and handle manually
            console.warn(`Dispute created for charge ${chargeId}. Manual review required.`);
            break;
        default:
            // Handle refund events that may not be in the main Stripe.Event type
            if (event.type.startsWith('refund.')) {
                const refundEvent = event; // Type assertion for refund events
                const refund = refundEvent.data.object;
                const refundBookingId = (_a = refund.metadata) === null || _a === void 0 ? void 0 : _a.booking_id;
                if (!refundBookingId) {
                    console.warn(`Refund webhook received with no booking_id in metadata: ${refund.id}, event type: ${event.type}`);
                    break;
                }
                if (event.type === 'refund.created') {
                    console.log(`Refund created for booking ID: ${refundBookingId}, refund ID: ${refund.id}`);
                    // Update payment record with refund information
                    const { error: refundCreateError } = yield supabase
                        .from('payments')
                        .update({
                        status: 'refunding',
                        refund_amount: refund.amount / 100, // convert cents to dollars
                        refunded_at: new Date().toISOString()
                    })
                        .eq('booking_id', refundBookingId);
                    if (refundCreateError) {
                        console.error(`Error updating payment with refund info for booking ${refundBookingId}:`, refundCreateError);
                    }
                    else {
                        console.log(`Successfully updated payment record with refund info for booking ${refundBookingId}`);
                    }
                }
                else if (event.type === 'refund.updated') {
                    console.log(`Refund updated for booking ID: ${refundBookingId}, status: ${refund.status}`);
                    let paymentStatus = 'refunding';
                    if (refund.status === 'succeeded') {
                        paymentStatus = 'refunded';
                    }
                    else if (refund.status === 'failed') {
                        paymentStatus = 'refund_failed';
                    }
                    const { error: refundUpdateError } = yield supabase
                        .from('payments')
                        .update({
                        status: paymentStatus,
                        refund_amount: refund.amount / 100,
                        refunded_at: refund.status === 'succeeded' ? new Date().toISOString() : undefined
                    })
                        .eq('booking_id', refundBookingId);
                    if (refundUpdateError) {
                        console.error(`Error updating payment refund status for booking ${refundBookingId}:`, refundUpdateError);
                    }
                    else {
                        console.log(`Successfully updated payment refund status to ${paymentStatus} for booking ${refundBookingId}`);
                    }
                }
                else if (event.type.includes('refund') && event.type.includes('failed')) {
                    console.log(`Refund failed for booking ID: ${refundBookingId}, refund ID: ${refund.id}`);
                    // Update payment status to indicate refund failed
                    const { error: refundFailedError } = yield supabase
                        .from('payments')
                        .update({
                        status: 'refund_failed'
                    })
                        .eq('booking_id', refundBookingId);
                    // Update the cancellation record with failure information
                    const { error: cancellationUpdateError } = yield supabase
                        .from('bookings_cancellations')
                        .update({
                        cancellation_reason: `Refund failed: ${refund.failure_reason || 'Unknown reason'}. Manual processing required.`
                    })
                        .eq('booking_id', refundBookingId);
                    if (refundFailedError || cancellationUpdateError) {
                        console.error(`Error updating records for failed refund on booking ${refundBookingId}:`, refundFailedError || cancellationUpdateError);
                    }
                    else {
                        console.log(`Updated records for failed refund on booking ${refundBookingId}`);
                    }
                }
            }
            else {
                console.log(`Unhandled event type ${event.type}`);
            }
            break;
    }
    res.json({ received: true });
}));
// Use json parser for all other routes
app.use(express_1.default.json());
// =====================================================
// TYPINGS
// =====================================================
// Helper function to parse time string (e.g., "2:30 PM") and return hours and minutes
const parseTimeString = (timeStr) => {
    try {
        // If it's already an ISO string, extract the time part
        if (timeStr.includes('T')) {
            const timePart = timeStr.split('T')[1].split('.')[0]; // Get HH:MM:SS part
            const [hours, minutes] = timePart.split(':').map(Number);
            return { hours, minutes };
        }
        // Otherwise parse as 12-hour format
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        const isPM = period === 'PM';
        const hour24 = isPM ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);
        return { hours: hour24, minutes };
    }
    catch (error) {
        console.error('Error parsing time string:', timeStr, error);
        throw new Error(`Invalid time format: ${timeStr}`);
    }
};
// Helper function to create ISO timestamp from date and time string
const createISOTimestamp = (date, timeStr, timezone = 'America/New_York') => {
    try {
        const { hours, minutes } = parseTimeString(timeStr);
        // Create a date-time string in ISO format but without timezone
        const isoString = `${date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00.000`;
        // Create a date object from this string (will be in local server time)
        const localDate = new Date(isoString);
        // Convert to the target timezone using toLocaleString, then back to a Date object
        const timeInTargetTZ = localDate.toLocaleString('sv-SE', { timeZone: timezone });
        const targetDate = new Date(timeInTargetTZ);
        // Calculate the offset between what we want and what we got
        const offset = localDate.getTime() - targetDate.getTime();
        // Apply the offset to get the correct UTC time
        const utcDate = new Date(localDate.getTime() + offset);
        return utcDate.toISOString();
    }
    catch (error) {
        console.error('Error creating timestamp:', { date, timeStr, timezone }, error);
        throw error;
    }
};
// =====================================================
// BACKGROUND JOBS
// =====================================================
// =====================================================
// API ROUTES
// =====================================================
// Phase 1: Reserve a booking
app.post('/bookings/reserve', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { locationId, userId, bayId, date, startTime, endTime, partySize, totalAmount } = req.body;
    // Basic validation
    if (!locationId || !userId || !bayId || !date || !startTime || !endTime || !partySize || !totalAmount) {
        return res.status(400).send({ error: 'Missing required booking details' });
    }
    try {
        // First, get the location's timezone
        const { data: location, error: locationError } = yield supabase
            .from('locations')
            .select('timezone')
            .eq('id', locationId)
            .single();
        if (locationError || !location) {
            console.error('Error fetching location timezone:', locationError);
            return res.status(400).send({ error: 'Invalid location ID' });
        }
        const timezone = location.timezone || 'America/New_York';
        // Validate that start and end times are on the same day
        const startTimeParsed = parseTimeString(startTime);
        const endTimeParsed = parseTimeString(endTime);
        // If end time is earlier than start time, it suggests an overnight booking
        if (endTimeParsed.hours < startTimeParsed.hours ||
            (endTimeParsed.hours === startTimeParsed.hours && endTimeParsed.minutes < startTimeParsed.minutes)) {
            return res.status(400).send({
                error: 'Overnight bookings are not allowed. Please book within a single day (12am to 11:59pm).'
            });
        }
        const p_start_time = createISOTimestamp(date, startTime, timezone);
        const p_end_time = createISOTimestamp(date, endTime, timezone);
        console.log(`Creating booking with timezone ${timezone}:`, {
            input: { date, startTime, endTime },
            output: { p_start_time, p_end_time }
        });
        // Set expiration time using UTC timestamp
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        // Generate a temporary payment intent ID for the reservation
        const tempPaymentIntentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Extract IP address and user agent from request
        const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
        const userAgent = req.get('User-Agent') || 'Unknown';
        // Call the PostgreSQL function to create booking and all related records
        const { data, error } = yield supabase.rpc('create_booking_and_payment_record', {
            p_location_id: locationId,
            p_user_id: userId,
            p_bay_id: bayId,
            p_start_time: p_start_time,
            p_end_time: p_end_time,
            p_party_size: partySize,
            p_total_amount: totalAmount,
            p_payment_intent_id: tempPaymentIntentId,
            p_user_agent: userAgent,
            p_ip_address: ipAddress
        });
        if (error) {
            console.error('Error calling create_booking_and_payment_record function:', error);
            // Handle common database errors
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('duplicate key')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('already exists'))) {
                return res.status(409).send({ error: 'This time slot is no longer available.' });
            }
            if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('Time slot is already booked')) {
                return res.status(409).send({ error: 'This time slot is no longer available.' });
            }
            throw error;
        }
        if (!(data === null || data === void 0 ? void 0 : data.booking_id)) {
            throw new Error('Failed to create booking - no booking ID returned');
        }
        console.log(`Created new booking ${data.booking_id} for bay ${bayId} from ${p_start_time} to ${p_end_time}`);
        // Update the booking to have reserved status and set expiration
        const { error: updateError } = yield supabase
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
        res.status(201).send({
            bookingId: data.booking_id,
            expiresAt: expiresAt
        });
    }
    catch (error) {
        console.error("Error in /bookings/reserve:", error);
        res.status(500).send({ error: error.message });
    }
}));
// Phase 2: Create payment intent for a reservation
app.post('/bookings/:bookingId/create-payment-intent', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { bookingId } = req.params;
    const { amount } = req.body;
    if (!amount) {
        return res.status(400).send({ error: 'Amount is required' });
    }
    if (!bookingId) {
        return res.status(400).send({ error: 'Booking ID is required' });
    }
    try {
        // 1. Verify the booking is valid for payment
        const { data: booking, error: fetchError } = yield supabase
            .from('bookings')
            .select('id, status, expires_at, user_id, bay_id, location_id, created_at')
            .eq('id', bookingId)
            .single();
        if (fetchError || !booking) {
            console.error(`Booking ${bookingId} not found:`, fetchError);
            return res.status(404).send({ error: 'Booking not found.' });
        }
        console.log(`Payment intent requested for booking ${bookingId}:`, {
            status: booking.status,
            expires_at: booking.expires_at,
            created_at: booking.created_at,
            user_id: booking.user_id
        });
        if (booking.status !== 'reserved') {
            console.error(`Booking ${bookingId} has invalid status for payment: ${booking.status}`);
            return res.status(409).send({ error: `Booking cannot be paid for. Status: ${booking.status}` });
        }
        // Check expiration using UTC timestamp comparison
        const now = new Date().toISOString();
        if (booking.expires_at < now) {
            // The reservation has expired, update its status
            yield supabase
                .from('bookings')
                .update({ status: 'expired' })
                .eq('id', bookingId)
                .eq('status', 'reserved');
            return res.status(410).send({ error: 'Booking reservation has expired.' });
        }
        // 2. Check if a payment intent already exists for this booking
        const { data: existingPayment, error: paymentCheckError } = yield supabase
            .from('payments')
            .select('stripe_payment_intent_id, status')
            .eq('booking_id', bookingId)
            .in('status', ['pending', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (paymentCheckError && paymentCheckError.code !== 'PGRST116') {
            console.error('Error checking existing payments:', paymentCheckError);
            throw paymentCheckError;
        }
        // If we found an existing pending/processing payment, retrieve the payment intent
        if (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.stripe_payment_intent_id) {
            try {
                const existingPaymentIntent = yield stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id);
                // Check if the payment intent is still valid (not succeeded, canceled, or failed)
                if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(existingPaymentIntent.status)) {
                    console.log(`Reusing existing payment intent ${existingPaymentIntent.id} for booking ${bookingId}`);
                    return res.send({
                        clientSecret: existingPaymentIntent.client_secret,
                        bookingId: booking.id
                    });
                }
                else {
                    console.log(`Existing payment intent ${existingPaymentIntent.id} has status ${existingPaymentIntent.status}, creating new one`);
                }
            }
            catch (stripeError) {
                console.error('Error retrieving existing payment intent from Stripe:', stripeError);
                // Continue to create a new payment intent if we can't retrieve the existing one
            }
        }
        // 3. Create new Stripe Payment Intent
        const paymentIntent = yield stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: {
                booking_id: booking.id,
                user_id: booking.user_id,
                bay_id: booking.bay_id,
                location_id: booking.location_id
            }
        });
        // 4. Create a corresponding payment record
        const { error: paymentError } = yield supabase
            .from('payments')
            .insert({
            booking_id: booking.id,
            amount: amount / 100, // convert cents to dollars
            status: 'pending',
            stripe_payment_intent_id: paymentIntent.id,
            currency: 'usd',
            user_id: booking.user_id,
            location_id: booking.location_id // Add location_id
        });
        if (paymentError) {
            yield stripe.paymentIntents.cancel(paymentIntent.id);
            console.error('Error creating payment record, cancelling payment intent:', paymentError);
            throw paymentError;
        }
        console.log(`Created new payment intent ${paymentIntent.id} for booking ${bookingId}`);
        // 5. Send the client secret back to the frontend
        res.send({
            clientSecret: paymentIntent.client_secret,
            bookingId: booking.id
        });
    }
    catch (error) {
        console.error(`Error in /bookings/${bookingId}/create-payment-intent:`, error);
        res.status(500).send({ error: error.message });
    }
}));
app.post('/update-payment-intent', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { paymentIntentId, email, firstName, lastName, phone } = req.body;
    try {
        const paymentIntent = yield stripe.paymentIntents.update(paymentIntentId, {
            receipt_email: email,
            metadata: {
                firstName,
                lastName,
                phone,
            },
        });
        res.json({ success: true, paymentIntent });
    }
    catch (error) {
        console.error('Error updating payment intent:', error);
        res.status(500).json({
            error: 'Failed to update payment intent',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
// Replace the session-status endpoint with this
app.get("/payment-intent-status", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const paymentIntentId = req.query.payment_intent;
    if (!paymentIntentId) {
        return res.status(400).json({ error: "Payment Intent ID is required" });
    }
    try {
        const paymentIntent = yield stripe.paymentIntents.retrieve(paymentIntentId);
        res.json({
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency
        });
    }
    catch (error) {
        console.error("Error retrieving payment intent:", error);
        res.status(500).json({ error: "Failed to retrieve payment intent status" });
    }
}));
//Endpoint to get pricing rules for a specific location
app.get('/pricing-rules', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { locationId } = req.query;
        if (!locationId) {
            return res.status(400).json({ error: 'Location ID is required' });
        }
        const { data, error } = yield supabase
            .from('pricing_rules')
            .select('name, hourly_rate, start_time, end_time, days_of_week')
            .eq('location_id', locationId);
        if (error) {
            console.error('Error fetching pricing rules:', error);
            return res.status(500).json({ error: 'Failed to fetch pricing rules' });
        }
        // Format the pricing rules to match the frontend's expected format
        const formattedPricingRules = data.map(rule => ({
            name: rule.name,
            hourlyRate: rule.hourly_rate,
            startTime: rule.start_time,
            endTime: rule.end_time,
            daysOfWeek: rule.days_of_week
        }));
        return res.json(formattedPricingRules);
    }
    catch (error) {
        console.error('Error in /pricing-rules endpoint:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to get bookings for a specific date and location
app.get('/bookings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { locationId, date } = req.query;
        if (!locationId || !date) {
            return res.status(400).json({ error: 'locationId and date are required query parameters' });
        }
        // First, get the location's timezone
        const { data: location, error: locationError } = yield supabase
            .from('locations')
            .select('timezone')
            .eq('id', locationId)
            .single();
        if (locationError || !location) {
            console.error('Error fetching location timezone:', locationError);
            return res.status(400).json({ error: 'Invalid location ID' });
        }
        const timezone = location.timezone || 'America/New_York';
        // Create date range for the specified date in the location's timezone
        // We need to find all bookings that fall within the local date range
        const requestedDate = new Date(date);
        // Create start and end of day in the location's timezone
        const startOfDayLocal = new Date(requestedDate);
        startOfDayLocal.setHours(0, 0, 0, 0);
        const endOfDayLocal = new Date(requestedDate);
        endOfDayLocal.setHours(23, 59, 59, 999);
        // Convert these local times to UTC using the same logic as createISOTimestamp
        const convertLocalToUTC = (localDate) => {
            // Convert to the target timezone using toLocaleString, then back to a Date object
            const timeInTargetTZ = localDate.toLocaleString('sv-SE', { timeZone: timezone });
            const targetDate = new Date(timeInTargetTZ);
            // Calculate the offset between what we want and what we got
            const offset = localDate.getTime() - targetDate.getTime();
            // Apply the offset to get the correct UTC time
            const utcDate = new Date(localDate.getTime() + offset);
            return utcDate.toISOString();
        };
        const startOfDayUTC = convertLocalToUTC(startOfDayLocal);
        const endOfDayUTC = convertLocalToUTC(endOfDayLocal);
        console.log(`Fetching bookings for ${date} in timezone ${timezone}:`, {
            localRange: `${startOfDayLocal.toISOString()} to ${endOfDayLocal.toISOString()}`,
            utcRange: `${startOfDayUTC} to ${endOfDayUTC}`
        });
        // Query the bookings for the specified date and location
        // Get bookings that overlap with the requested day
        const { data, error } = yield supabase
            .from('bookings')
            .select('id, bay_id, start_time, end_time, status')
            .eq('location_id', locationId)
            .gte('start_time', startOfDayUTC)
            .lt('start_time', endOfDayUTC) // Only get bookings that start within the day
            .neq('status', 'cancelled')
            .neq('status', 'no_show')
            .neq('status', 'expired');
        if (error) {
            console.error('Error fetching bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch bookings' });
        }
        // Convert UTC timestamps back to local time for display
        // But we need to do this conversion properly using the location's timezone
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
        return res.json(formattedBookings);
    }
    catch (error) {
        console.error('Error in /bookings endpoint:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to get bays per location and their status/availability
app.get('/bays', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { locationId } = req.query;
    if (!locationId) {
        return res.status(400).json({ error: 'Location ID is required' });
    }
    try {
        const { data, error } = yield supabase
            .from('bays')
            .select('id, status, location_id, bay_number, name')
            .eq('location_id', locationId);
        if (error) {
            console.error('Error fetching bays:', error);
            return res.status(500).json({ error: 'Failed to fetch bays' });
        }
        return res.json(data);
    }
    catch (error) {
        console.error('Error in /bays endpoint:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to check for existing reserved bookings for a user
app.get('/users/:userId/bookings/reserved', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    try {
        // Get current time in UTC
        const now = new Date().toISOString();
        const { data, error } = yield supabase
            .from('bookings')
            .select('id, start_time, end_time, total_amount, status, expires_at, bay_id, location_id, bays (name, bay_number)')
            .eq('user_id', userId)
            .eq('status', 'reserved')
            .gt('expires_at', now) // Only get non-expired reservations
            .order('created_at', { ascending: false })
            .limit(1); // Get the most recent reservation
        if (error) {
            console.error('Error fetching reserved user bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch reserved user bookings' });
        }
        if (!data || data.length === 0) {
            return res.json({ reservation: null });
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
        return res.json({ reservation: formattedReservation });
    }
    catch (error) {
        console.error(`Error in /users/${userId}/bookings/reserved endpoint:`, error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to get future user-specific bookings
app.get('/users/:userId/bookings/future', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    try {
        // Use current time (now) as cutoff instead of start of today
        // This ensures bookings that have already ended don't appear in "future" bookings
        const now = new Date().toISOString();
        const { data, error } = yield supabase
            .from('bookings')
            .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
            .eq('user_id', userId)
            .gte('end_time', now) // Use end_time to ensure booking hasn't finished yet
            .not('status', 'in', '("reserved","expired")')
            .order('start_time', { ascending: true });
        if (error) {
            console.error('Error fetching future user bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch future user bookings' });
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
        return res.json(formattedBookings);
    }
    catch (error) {
        console.error(`Error in /users/${userId}/bookings/future endpoint:`, error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to get past user-specific bookings
app.get('/users/:userId/bookings/past', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    try {
        // Use current time (now) as cutoff - bookings that have ended
        const now = new Date().toISOString();
        const { data, error } = yield supabase
            .from('bookings')
            .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
            .eq('user_id', userId)
            .lt('end_time', now) // Use end_time to find bookings that have finished
            .order('start_time', { ascending: false });
        if (error) {
            console.error('Error fetching past user bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch past user bookings' });
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
        return res.json(formattedBookings);
    }
    catch (error) {
        console.error(`Error in /users/${userId}/bookings/past endpoint:`, error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to cancel a booking (24-hour policy)
app.post('/bookings/:bookingId/cancel', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { bookingId } = req.params;
    const { userId } = req.body;
    if (!bookingId || !userId) {
        return res.status(400).json({ error: 'Booking ID and User ID are required' });
    }
    try {
        // 1. Get the booking details
        const { data: booking, error: fetchError } = yield supabase
            .from('bookings')
            .select('id, user_id, start_time, status, total_amount')
            .eq('id', bookingId)
            .eq('user_id', userId) // Ensure user owns the booking
            .single();
        if (fetchError || !booking) {
            return res.status(404).json({ error: 'Booking not found or access denied' });
        }
        // 2. Check if booking can be cancelled
        if (booking.status === 'cancelled') {
            return res.status(400).json({ error: 'Booking is already cancelled' });
        }
        if (booking.status !== 'confirmed') {
            return res.status(400).json({ error: 'Only confirmed bookings can be cancelled' });
        }
        // 3. Check 24-hour policy
        const bookingStartTime = new Date(booking.start_time);
        const now = new Date();
        const hoursDifference = (bookingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursDifference < 24) {
            return res.status(400).json({
                error: 'Bookings cannot be cancelled within 24 hours of the start time',
                hoursRemaining: Math.round(hoursDifference * 10) / 10
            });
        }
        // 4. Get the payment record to process refund
        const { data: payment, error: paymentError } = yield supabase
            .from('payments')
            .select('stripe_payment_intent_id, amount, status')
            .eq('booking_id', bookingId)
            .eq('status', 'succeeded')
            .single();
        if (paymentError || !payment) {
            // If no successful payment found, just cancel the booking
            console.warn(`No successful payment found for booking ${bookingId}, cancelling without refund`);
        }
        // 5. Process Stripe refund if payment exists
        let refundId = null;
        if (payment && payment.stripe_payment_intent_id) {
            try {
                const refund = yield stripe.refunds.create({
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
                return res.status(500).json({
                    error: 'Failed to process refund. Please contact support.',
                    details: stripeError.message
                });
            }
        }
        // 6. Update booking status to cancelled and immediately expire it
        const { error: updateBookingError } = yield supabase
            .from('bookings')
            .update({
            status: 'cancelled',
            expires_at: new Date().toISOString() // Immediately expire cancelled bookings to free the slot
        })
            .eq('id', bookingId);
        if (updateBookingError) {
            console.error(`Error updating booking ${bookingId} to cancelled:`, updateBookingError);
            throw updateBookingError;
        }
        console.log(`Booking ${bookingId} cancelled and time slot freed for new reservations`);
        // 7. Create cancellation record
        const { error: cancellationError } = yield supabase
            .from('booking_cancellations')
            .insert({
            booking_id: bookingId,
            cancelled_by: userId,
            cancellation_reason: 'Customer requested cancellation',
            cancellation_fee: 0, // No fee for 24+ hour cancellations
            refund_amount: payment ? payment.amount : 0,
            cancelled_at: new Date().toISOString()
        });
        if (cancellationError) {
            console.error(`Error creating cancellation record for booking ${bookingId}:`, cancellationError);
            // Don't fail the request since booking was already cancelled
        }
        // 8. Update payment status if refund was processed
        if (payment && refundId) {
            const { error: updatePaymentError } = yield supabase
                .from('payments')
                .update({
                status: 'refunded',
                refund_amount: payment.amount,
                refunded_at: new Date().toISOString()
            })
                .eq('booking_id', bookingId);
            if (updatePaymentError) {
                console.error(`Error updating payment status for booking ${bookingId}:`, updatePaymentError);
                // Don't fail the request since booking was already cancelled
            }
        }
        res.json({
            success: true,
            bookingId,
            refundId,
            message: refundId ? 'Booking cancelled and refund processed' : 'Booking cancelled'
        });
    }
    catch (error) {
        console.error(`Error cancelling booking ${bookingId}:`, error);
        res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
    }
}));
// Endpoint to get all locations
app.get('/locations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabase
            .from('locations')
            .select('id, name, slug, address, city, state, zip_code, phone, timezone, status')
            .eq('status', 'active')
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (error) {
            console.error('Error fetching locations:', error);
            return res.status(500).json({ error: 'Failed to fetch locations' });
        }
        const formattedLocations = data.map(location => ({
            id: location.id,
            name: location.name,
            slug: location.slug,
            address: location.address,
            city: location.city,
            state: location.state,
            zipCode: location.zip_code,
            phone: location.phone,
            timezone: location.timezone,
            status: location.status
        }));
        return res.json(formattedLocations);
    }
    catch (error) {
        console.error('Error in /locations endpoint:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// Endpoint to get a specific location by ID
app.get('/locations/:locationId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { locationId } = req.params;
    if (!locationId) {
        return res.status(400).json({ error: 'Location ID is required' });
    }
    try {
        const { data, error } = yield supabase
            .from('locations')
            .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, settings')
            .eq('id', locationId)
            .eq('status', 'active')
            .is('deleted_at', null)
            .single();
        if (error || !data) {
            console.error(`Location ${locationId} not found:`, error);
            return res.status(404).json({ error: 'Location not found' });
        }
        const formattedLocation = {
            id: data.id,
            name: data.name,
            slug: data.slug,
            address: data.address,
            city: data.city,
            state: data.state,
            zipCode: data.zip_code,
            phone: data.phone,
            timezone: data.timezone,
            status: data.status,
            settings: data.settings
        };
        return res.json(formattedLocation);
    }
    catch (error) {
        console.error(`Error in /locations/${locationId} endpoint:`, error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}));
// =====================================================
// SERVER START
// =====================================================
app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));
