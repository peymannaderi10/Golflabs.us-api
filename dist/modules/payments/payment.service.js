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
exports.PaymentService = void 0;
const stripe_1 = require("../../config/stripe");
const database_1 = require("../../config/database");
class PaymentService {
    createPaymentIntent(bookingId, amount, promotionInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (amount === undefined) {
                throw new Error('Amount is required');
            }
            if (!bookingId) {
                throw new Error('Booking ID is required');
            }
            // 1. Verify the booking is valid for payment
            const { data: booking, error: fetchError } = yield database_1.supabase
                .from('bookings')
                .select('id, status, expires_at, user_id, bay_id, location_id, created_at, total_amount')
                .eq('id', bookingId)
                .single();
            if (fetchError || !booking) {
                console.error(`Booking ${bookingId} not found:`, fetchError);
                throw new Error('Booking not found.');
            }
            console.log(`Payment intent requested for booking ${bookingId}:`, {
                status: booking.status,
                expires_at: booking.expires_at,
                created_at: booking.created_at,
                user_id: booking.user_id
            });
            if (booking.status !== 'reserved') {
                console.error(`Booking ${bookingId} has invalid status for payment: ${booking.status}`);
                throw new Error(`Booking cannot be paid for. Status: ${booking.status}`);
            }
            // Check expiration using UTC timestamp comparison
            const now = new Date().toISOString();
            if (booking.expires_at < now) {
                // The reservation has expired, update its status
                yield database_1.supabase
                    .from('bookings')
                    .update({ status: 'expired' })
                    .eq('id', bookingId)
                    .eq('status', 'reserved');
                throw new Error('Booking reservation has expired.');
            }
            // 2. Check if a payment intent already exists for this booking
            const { data: existingPayment, error: paymentCheckError } = yield database_1.supabase
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
                    const existingPaymentIntent = yield stripe_1.stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id);
                    // Check if the payment intent is still valid (not succeeded, canceled, or failed)
                    if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(existingPaymentIntent.status)) {
                        console.log(`Reusing existing payment intent ${existingPaymentIntent.id} for booking ${bookingId}`);
                        return {
                            clientSecret: existingPaymentIntent.client_secret,
                            bookingId: booking.id
                        };
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
            // 3. Ensure user has a Stripe Customer (for saving cards for future off-session charges)
            let stripeCustomerId = null;
            try {
                const { data: userProfile, error: userError } = yield database_1.supabase
                    .from('user_profiles')
                    .select('stripe_customer_id, email')
                    .eq('id', booking.user_id)
                    .single();
                if (!userError && userProfile) {
                    if (userProfile.stripe_customer_id) {
                        stripeCustomerId = userProfile.stripe_customer_id;
                        console.log(`Using existing Stripe customer ${stripeCustomerId} for user ${booking.user_id}`);
                    }
                    else if (userProfile.email) {
                        // Create a new Stripe Customer
                        const customer = yield stripe_1.stripe.customers.create({
                            email: userProfile.email,
                            metadata: { user_id: booking.user_id }
                        });
                        stripeCustomerId = customer.id;
                        // Save the Stripe Customer ID to user_profiles
                        yield database_1.supabase
                            .from('user_profiles')
                            .update({ stripe_customer_id: customer.id })
                            .eq('id', booking.user_id);
                        console.log(`Created new Stripe customer ${customer.id} for user ${booking.user_id}`);
                    }
                }
            }
            catch (customerError) {
                console.error(`Error setting up Stripe customer for user ${booking.user_id}:`, customerError.message);
                // Continue without customer - payment will still work, just won't save card
            }
            // 4. If promotion info is provided, update the booking with discount info
            if (promotionInfo && promotionInfo.promotionId) {
                const { error: updateBookingError } = yield database_1.supabase
                    .from('bookings')
                    .update({
                    original_amount: promotionInfo.originalAmount,
                    discount_amount: promotionInfo.discountAmount,
                    promotion_id: promotionInfo.promotionId,
                    total_amount: amount / 100 // Update total to discounted amount in dollars
                })
                    .eq('id', bookingId);
                if (updateBookingError) {
                    console.error('Error updating booking with promotion info:', updateBookingError);
                    // Continue anyway, the booking can still be paid
                }
                else {
                    console.log(`Updated booking ${bookingId} with promotion discount: $${promotionInfo.discountAmount}`);
                }
            }
            // 5. Create new Stripe Payment Intent (with customer + save card for future use)
            const paymentIntentParams = {
                amount,
                currency: 'usd',
                automatic_payment_methods: { enabled: true },
                metadata: {
                    booking_id: booking.id,
                    user_id: booking.user_id,
                    bay_id: booking.bay_id,
                    location_id: booking.location_id,
                    // Include promotion info in metadata for webhook processing
                    promotion_id: (promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.promotionId) || '',
                    discount_amount: ((_a = promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.discountAmount) === null || _a === void 0 ? void 0 : _a.toString()) || '0',
                    free_minutes: ((_b = promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.freeMinutes) === null || _b === void 0 ? void 0 : _b.toString()) || '0',
                    original_amount: ((_c = promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.originalAmount) === null || _c === void 0 ? void 0 : _c.toString()) || (amount / 100).toString()
                }
            };
            // Attach Stripe Customer and save card for future off-session charges (extensions)
            if (stripeCustomerId) {
                paymentIntentParams.customer = stripeCustomerId;
                paymentIntentParams.setup_future_usage = 'off_session';
            }
            const paymentIntent = yield stripe_1.stripe.paymentIntents.create(paymentIntentParams);
            // 6. Create a corresponding payment record
            const { error: paymentError } = yield database_1.supabase
                .from('payments')
                .insert({
                booking_id: booking.id,
                amount: amount / 100, // convert cents to dollars (this is the discounted amount)
                status: 'pending',
                stripe_payment_intent_id: paymentIntent.id,
                currency: 'usd',
                user_id: booking.user_id,
                location_id: booking.location_id
            });
            if (paymentError) {
                yield stripe_1.stripe.paymentIntents.cancel(paymentIntent.id);
                console.error('Error creating payment record, cancelling payment intent:', paymentError);
                throw paymentError;
            }
            console.log(`Created new payment intent ${paymentIntent.id} for booking ${bookingId} (amount: $${amount / 100}, discount: $${(promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.discountAmount) || 0})`);
            // 7. Send the client secret back to the frontend
            return {
                clientSecret: paymentIntent.client_secret,
                bookingId: booking.id
            };
        });
    }
    updatePaymentIntent(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { paymentIntentId, email, firstName, lastName, phone } = data;
            const paymentIntent = yield stripe_1.stripe.paymentIntents.update(paymentIntentId, {
                receipt_email: email,
                metadata: {
                    firstName,
                    lastName,
                    phone,
                },
            });
            return { success: true, paymentIntent };
        });
    }
    getPaymentIntentStatus(paymentIntentId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!paymentIntentId) {
                throw new Error("Payment Intent ID is required");
            }
            const paymentIntent = yield stripe_1.stripe.paymentIntents.retrieve(paymentIntentId);
            return {
                status: paymentIntent.status,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency
            };
        });
    }
    calculatePrice(locationId, startTime, endTime) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !startTime || !endTime) {
                throw new Error('locationId, startTime, and endTime are required');
            }
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
                throw new Error('Invalid startTime or endTime');
            }
            // Get location timezone for proper pricing rule application
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            if (locationError || !location) {
                throw new Error('Invalid location ID');
            }
            const timezone = location.timezone || 'America/New_York';
            const { data: rules, error: rulesError } = yield database_1.supabase
                .from('pricing_rules')
                .select('name, hourly_rate, start_time, end_time, days_of_week')
                .eq('location_id', locationId);
            if (rulesError)
                throw rulesError;
            if (!rules || rules.length === 0) {
                throw new Error('No pricing rules found for this location');
            }
            let total = 0;
            const breakdown = [];
            let cursorTime = new Date(startDate);
            let currentSegment = null;
            while (cursorTime < endDate) {
                // Convert UTC time to local time for pricing rule determination
                const localHour = parseInt(cursorTime.toLocaleString('en-US', {
                    hour: '2-digit',
                    hour12: false,
                    timeZone: timezone
                }));
                // Determine which rate applies based on LOCAL time
                let rule;
                if (localHour >= 9 || localHour < 2) {
                    // Standard Rate: 9am-2am (local time)
                    rule = rules.find(r => r.name === "Standard Rate");
                }
                else {
                    // Off-Peak Rate: 2am-9am (local time)
                    rule = rules.find(r => r.name === "Off-Peak Rate");
                }
                if (!rule) {
                    throw new Error(`No pricing rule found for ${cursorTime.toISOString()} (local hour: ${localHour})`);
                }
                const priceForSlot = (rule.hourly_rate * 100) / 4; // price in cents for 15 mins
                if (!currentSegment || currentSegment.rateName !== rule.name) {
                    if (currentSegment) {
                        breakdown.push({
                            rateName: currentSegment.rateName,
                            start: currentSegment.start,
                            rate: currentSegment.rate,
                            end: cursorTime.toISOString(),
                        });
                    }
                    currentSegment = {
                        rateName: rule.name,
                        start: cursorTime.toISOString(),
                        rate: 0,
                    };
                }
                currentSegment.rate += priceForSlot;
                total += priceForSlot;
                cursorTime.setUTCMinutes(cursorTime.getUTCMinutes() + 15);
            }
            if (currentSegment) {
                breakdown.push({
                    rateName: currentSegment.rateName,
                    start: currentSegment.start,
                    rate: currentSegment.rate,
                    end: endDate.toISOString(),
                });
            }
            return {
                total: total,
                currency: 'usd',
                breakdown: breakdown,
            };
        });
    }
}
exports.PaymentService = PaymentService;
