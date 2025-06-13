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
    // Handle the event
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata.booking_id;
        if (bookingId) {
            console.log(`Payment succeeded for booking ID: ${bookingId}. Updating database...`);
            // Update booking status to 'confirmed'
            const { error: bookingError } = yield supabase
                .from('bookings')
                .update({ status: 'confirmed' })
                .eq('id', bookingId);
            // Update payment status to 'succeeded'
            const { error: paymentError } = yield supabase
                .from('payments')
                .update({ status: 'succeeded', processed_at: new Date().toISOString() })
                .eq('stripe_payment_intent_id', paymentIntent.id);
            if (bookingError || paymentError) {
                console.error('Error updating database after payment:', bookingError || paymentError);
                // Optionally, handle this error, e.g., by logging it for manual review
            }
            else {
                console.log(`Successfully updated booking ${bookingId} to confirmed.`);
                // You could trigger a confirmed booking notification here
            }
        }
    }
    res.json({ received: true });
}));
// Use json parser for all other routes
app.use(express_1.default.json());
// =====================================================
// API ROUTES
// =====================================================
app.post('/create-payment-intent', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { amount, bookingDetails } = req.body;
    // Basic validation
    if (!amount || !bookingDetails) {
        return res.status(400).send({ error: 'Missing amount or bookingDetails' });
    }
    try {
        // 1. Create Stripe Payment Intent first to get an ID
        const paymentIntent = yield stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: {
                // Temporary metadata, will be updated with booking ID
                user_id: bookingDetails.userId,
                bay_id: bookingDetails.bayId
            }
        });
        const paymentIntentId = paymentIntent.id;
        // 2. Call the Supabase function to create booking and other records
        const { data: dbData, error: dbError } = yield supabase.rpc('create_booking_and_payment_record', {
            p_location_id: bookingDetails.locationId,
            p_user_id: bookingDetails.userId,
            p_bay_id: bookingDetails.bayId,
            p_start_time: new Date(bookingDetails.date).toISOString(), // Combine date and start time properly
            p_end_time: new Date(bookingDetails.date).toISOString(), // Combine date and end time properly
            p_party_size: 1, // Or get from frontend
            p_total_amount: amount / 100, // Convert cents to dollars for DB
            p_payment_intent_id: paymentIntentId,
            p_user_agent: req.get('User-Agent') || '',
            p_ip_address: req.ip
        });
        if (dbError) {
            // If DB insert fails, we should cancel the Stripe Payment Intent
            yield stripe.paymentIntents.cancel(paymentIntentId);
            throw dbError;
        }
        const { booking_id } = dbData;
        // 3. Update the Payment Intent with the final booking_id
        yield stripe.paymentIntents.update(paymentIntentId, {
            metadata: { booking_id: booking_id },
        });
        // 4. Send the client secret back to the frontend
        res.send({
            clientSecret: paymentIntent.client_secret,
            bookingId: booking_id
        });
    }
    catch (error) {
        console.error("Error in /create-payment-intent:", error);
        res.status(500).send({ error: error.message });
    }
}));
app.post('/update-payment-intent', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { paymentIntentId, email, firstName, lastName, phone } = req.body;
    if (!paymentIntentId) {
        return res.status(400).send({ error: 'Payment Intent ID is required' });
    }
    try {
        const paymentIntent = yield stripe.paymentIntents.retrieve(paymentIntentId);
        const newMetadata = Object.assign(Object.assign({}, paymentIntent.metadata), { email: email, first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`, phone: phone, customer_info_updated_at: new Date().toISOString() });
        yield stripe.paymentIntents.update(paymentIntentId, {
            metadata: newMetadata,
        });
        res.sendStatus(200);
    }
    catch (error) {
        console.error("Error updating payment intent:", error);
        res.status(500).send({ error: error.message });
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
// =====================================================
// SERVER START
// =====================================================
app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));
