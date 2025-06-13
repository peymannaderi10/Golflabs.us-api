import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// =====================================================
// INITIALIZATION
// =====================================================

// Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
    console.error("Stripe secret key not found. Make sure you have a .env file with STRIPE_SECRET_KEY set.");
    process.exit(1);
}
const stripe = new Stripe(stripeSecretKey);

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase credentials not found. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const app = express();
const PORT = process.env.PORT || 4242;

// =====================================================
// MIDDLEWARE
// =====================================================

// Use cors before the webhook route
app.use(cors());

// Stripe webhook endpoint needs raw body
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("Stripe webhook secret not found.");
        return res.status(400).send('Webhook Error: Missing secret');
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        if (bookingId) {
            console.log(`Payment succeeded for booking ID: ${bookingId}. Updating database...`);

            // Update booking status to 'confirmed'
            const { error: bookingError } = await supabase
                .from('bookings')
                .update({ status: 'confirmed' })
                .eq('id', bookingId);
                
            // Update payment status to 'succeeded'
            const { error: paymentError } = await supabase
                .from('payments')
                .update({ status: 'succeeded', processed_at: new Date().toISOString() })
                .eq('stripe_payment_intent_id', paymentIntent.id);

            if (bookingError || paymentError) {
                console.error('Error updating database after payment:', bookingError || paymentError);
                // Optionally, handle this error, e.g., by logging it for manual review
            } else {
                console.log(`Successfully updated booking ${bookingId} to confirmed.`);
                // You could trigger a confirmed booking notification here
            }
        }
    }

    res.json({ received: true });
});

// Use json parser for all other routes
app.use(express.json());

// =====================================================
// TYPINGS
// =====================================================

interface BookingDetails {
    date: string;
    bayId: string; // Should be UUID
    startTime: string;
    endTime: string;
    duration: string;
    userId: string; // Should be UUID
    locationId: string; // Should be UUID
}

interface PaymentRequestBody {
    amount: number; // in cents
    bookingDetails: BookingDetails;
}

// =====================================================
// API ROUTES
// =====================================================

app.post('/create-payment-intent', async (req: Request, res: Response) => {
    const { amount, bookingDetails } = req.body as PaymentRequestBody;
    
    // Basic validation
    if (!amount || !bookingDetails) {
        return res.status(400).send({ error: 'Missing amount or bookingDetails' });
    }

    try {
        // 1. Create Stripe Payment Intent first to get an ID
        const paymentIntent = await stripe.paymentIntents.create({
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
        const { data: dbData, error: dbError } = await supabase.rpc('create_booking_and_payment_record', {
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
            await stripe.paymentIntents.cancel(paymentIntentId);
            throw dbError;
        }

        const { booking_id } = dbData;

        // 3. Update the Payment Intent with the final booking_id
        await stripe.paymentIntents.update(paymentIntentId, {
            metadata: { booking_id: booking_id },
        });

        // 4. Send the client secret back to the frontend
        res.send({
            clientSecret: paymentIntent.client_secret,
            bookingId: booking_id
        });

    } catch (error: any) {
        console.error("Error in /create-payment-intent:", error);
        res.status(500).send({ error: error.message });
    }
});

interface UpdatePaymentIntentRequest {
    paymentIntentId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
}

app.post('/update-payment-intent', async (req: Request, res: Response) => {
    const { paymentIntentId, email, firstName, lastName, phone } = req.body as UpdatePaymentIntentRequest;

    if (!paymentIntentId) {
        return res.status(400).send({ error: 'Payment Intent ID is required' });
    }

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        const newMetadata = {
            ...paymentIntent.metadata,
            email: email,
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`,
            phone: phone,
            customer_info_updated_at: new Date().toISOString(),
        };

        await stripe.paymentIntents.update(paymentIntentId, {
            metadata: newMetadata,
        });

        res.sendStatus(200);
    } catch (error: any) {
        console.error("Error updating payment intent:", error);
        res.status(500).send({ error: error.message });
    }
});

// Replace the session-status endpoint with this
app.get("/payment-intent-status", async (req, res) => {
  const paymentIntentId = req.query.payment_intent as string;
  
  if (!paymentIntentId) {
    return res.status(400).json({ error: "Payment Intent ID is required" });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });
  } catch (error) {
    console.error("Error retrieving payment intent:", error);
    res.status(500).json({ error: "Failed to retrieve payment intent status" });
  }
});

// =====================================================
// SERVER START
// =====================================================

app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`)); 