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
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const bookingId = paymentIntent.metadata.booking_id;

    if (!bookingId) {
        console.warn(`Webhook received for event ${event.type} with no booking_id in metadata.`);
        // Stripe sends some webhooks without metadata, it's safe to ignore them if we only care about bookings
        return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
    }

    switch (event.type) {
        case 'payment_intent.succeeded':
            console.log(`Payment succeeded for booking ID: ${bookingId}. Updating database...`);

            // Update booking status to 'confirmed' and clear expiration
            const { error: bookingError } = await supabase
                .from('bookings')
                .update({ status: 'confirmed', expires_at: null })
                .eq('id', bookingId);
                
            // Update payment status to 'succeeded'
            const { error: paymentError } = await supabase
                .from('payments')
                .update({ status: 'succeeded', processed_at: new Date().toISOString() })
                .eq('stripe_payment_intent_id', paymentIntent.id);

            if (bookingError || paymentError) {
                console.error(`Error updating database after payment for booking ${bookingId}:`, bookingError || paymentError);
            } else {
                console.log(`Successfully updated booking ${bookingId} to confirmed.`);
            }
            break;

        case 'payment_intent.canceled':
            console.log(`Payment canceled for booking ID: ${bookingId}. Updating database...`);

            // Update booking status to 'cancelled'
            const { error: cancelBookingError } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', bookingId)
                .neq('status', 'confirmed'); // Don't cancel a booking that is already confirmed

            // Update payment status to 'cancelled'
            const { error: cancelPaymentError } = await supabase
                .from('payments')
                .update({ status: 'cancelled' })
                .eq('stripe_payment_intent_id', paymentIntent.id);
            
            if (cancelBookingError || cancelPaymentError) {
                console.error(`Error updating database after payment cancellation for booking ${bookingId}:`, cancelBookingError || cancelPaymentError);
            } else {
                console.log(`Successfully updated booking ${bookingId} to cancelled.`);
            }
            break;
        
        case 'payment_intent.payment_failed':
            console.log(`Payment failed for booking ID: ${bookingId}.`);
            // Update payment record to failed. The booking remains 'reserved' until it expires.
            const { error: paymentFailedError } = await supabase
                .from('payments')
                .update({ status: 'failed' })
                .eq('stripe_payment_intent_id', paymentIntent.id);

            if (paymentFailedError) {
                console.error(`Error updating payment status to failed for booking ${bookingId}:`, paymentFailedError);
            }
            break;
        
        default:
            console.log(`Unhandled event type ${event.type} for booking ID: ${bookingId}`);
    }

    res.json({ received: true });
});

// Use json parser for all other routes
app.use(express.json());

// =====================================================
// TYPINGS
// =====================================================

// Helper function to parse time string (e.g., "2:30 PM") and return hours and minutes
const parseTimeString = (timeStr: string): { hours: number; minutes: number } => {
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
  } catch (error) {
    console.error('Error parsing time string:', timeStr, error);
    throw new Error(`Invalid time format: ${timeStr}`);
  }
};

// Helper function to create ISO timestamp from date and time string
const createISOTimestamp = (date: string, timeStr: string): string => {
  try {
    const { hours, minutes } = parseTimeString(timeStr);
    const timestamp = new Date(date);
    
    // Validate the date
    if (isNaN(timestamp.getTime())) {
      throw new Error(`Invalid date: ${date}`);
    }
    
    // Set the time in UTC
    timestamp.setUTCHours(hours, minutes, 0, 0);
    return timestamp.toISOString();
  } catch (error) {
    console.error('Error creating timestamp:', { date, timeStr }, error);
    throw error;
  }
};

interface BookingDetails {
    date: string;
    bayId: string; // Should be UUID
    startTime: string;
    endTime: string;
    partySize: number;
    userId: string; // Should be UUID
    locationId: string; // Should be UUID
    totalAmount: number; // Add total amount
}

interface CreatePaymentForBookingBody {
    amount: number; // in cents
}

interface PricingRule {
  name: string;
  hourlyRate: number;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
}

// =====================================================
// BACKGROUND JOBS
// =====================================================

// Function to handle expired reservations
async function handleExpiredReservations() {
    try {
        const now = new Date().toISOString();
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'expired' })
            .lt('expires_at', now)
            .eq('status', 'reserved');

        if (error) {
            console.error('Error handling expired reservations:', error);
            return;
        }

        console.log('Checked for expired reservations');
    } catch (error) {
        console.error('Error in handleExpiredReservations:', error);
    }
}

// Run the expiration check every minute
setInterval(handleExpiredReservations, 60 * 1000);

// =====================================================
// API ROUTES
// =====================================================

// Phase 1: Reserve a booking
app.post('/bookings/reserve', async (req: Request, res: Response) => {
    const { 
        locationId, 
        userId, 
        bayId, 
        date, 
        startTime, 
        endTime, 
        partySize,
        totalAmount 
    } = req.body as BookingDetails;

    // Basic validation
    if (!locationId || !userId || !bayId || !date || !startTime || !endTime || !partySize || !totalAmount) {
        return res.status(400).send({ error: 'Missing required booking details' });
    }

    try {
        // Parse the time strings to get hours and minutes
        const parseTimeStr = (timeStr: string): { hours: number; minutes: number } => {
            const [time, period] = timeStr.split(' ');
            const [hours, minutes] = time.split(':').map(Number);
            const isPM = period === 'PM';
            const hour24 = isPM ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);
            return { hours: hour24, minutes };
        };

        // Validate that start and end times are on the same day
        const startTimeParsed = parseTimeStr(startTime);
        const endTimeParsed = parseTimeStr(endTime);

        // If end time is earlier than start time, it suggests an overnight booking
        if (endTimeParsed.hours < startTimeParsed.hours || 
            (endTimeParsed.hours === startTimeParsed.hours && endTimeParsed.minutes < startTimeParsed.minutes)) {
            return res.status(400).send({ 
                error: 'Overnight bookings are not allowed. Please book within a single day (12am to 11:59pm).' 
            });
        }

        const p_start_time = createISOTimestamp(date, startTime);
        const p_end_time = createISOTimestamp(date, endTime);
        
        // Set expiration time using UTC timestamp
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

        // Insert booking with 'reserved' status
        const { data, error } = await supabase
            .from('bookings')
            .insert({
                location_id: locationId,
                user_id: userId,
                bay_id: bayId,
                start_time: p_start_time,
                end_time: p_end_time,
                party_size: partySize,
                status: 'reserved',
                expires_at: expiresAt,
                total_amount: totalAmount // Add total amount
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error creating reserved booking:', error);
            // Handle exclusion constraint violation for overlapping bookings
            if (error.code === '23P01') { 
                 return res.status(409).send({ error: 'This time slot is no longer available.' });
            }
            throw error;
        }

        res.status(201).send({
            bookingId: data.id,
            expiresAt: expiresAt
        });

    } catch (error: any) {
        console.error("Error in /bookings/reserve:", error);
        res.status(500).send({ error: error.message });
    }
});

// Phase 2: Create payment intent for a reservation
app.post('/bookings/:bookingId/create-payment-intent', async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const { amount } = req.body as CreatePaymentForBookingBody;

    if (!amount) {
        return res.status(400).send({ error: 'Amount is required' });
    }
    if (!bookingId) {
        return res.status(400).send({ error: 'Booking ID is required' });
    }

    try {
        // 1. Verify the booking is valid for payment
        const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select('id, status, expires_at, user_id, bay_id, location_id')
            .eq('id', bookingId)
            .single();

        if (fetchError || !booking) {
            return res.status(404).send({ error: 'Booking not found.' });
        }

        if (booking.status !== 'reserved') {
            return res.status(409).send({ error: `Booking cannot be paid for. Status: ${booking.status}` });
        }

        // Check expiration using UTC timestamp comparison
        const now = new Date().toISOString();
        if (booking.expires_at < now) {
            // The reservation has expired, update its status
            await supabase
                .from('bookings')
                .update({ status: 'expired' })
                .eq('id', bookingId)
                .eq('status', 'reserved');
            return res.status(410).send({ error: 'Booking reservation has expired.' });
        }

        // 2. Create Stripe Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
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

        // 3. Create a corresponding payment record
        const { error: paymentError } = await supabase
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
             await stripe.paymentIntents.cancel(paymentIntent.id);
             console.error('Error creating payment record, cancelling payment intent:', paymentError);
             throw paymentError;
        }

        // 4. Send the client secret back to the frontend
        res.send({
            clientSecret: paymentIntent.client_secret,
            bookingId: booking.id
        });

    } catch (error: any) {
        console.error(`Error in /bookings/${bookingId}/create-payment-intent:`, error);
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
    const { paymentIntentId, email, firstName, lastName, phone } = req.body;

    try {
        const paymentIntent = await stripe.paymentIntents.update(paymentIntentId, {
            receipt_email: email,
            metadata: {
                firstName,
                lastName,
                phone,
            },
        });

        res.json({ success: true, paymentIntent });
    } catch (error) {
        console.error('Error updating payment intent:', error);
        res.status(500).json({ 
            error: 'Failed to update payment intent',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
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

//Endpoint to get pricing rules for a specific location
app.get('/pricing-rules', async (req, res) => {
  try {
    const { locationId } = req.query;

    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    const { data, error } = await supabase
      .from('pricing_rules')
      .select('name, hourly_rate, start_time, end_time, days_of_week')
      .eq('location_id', locationId);

    if (error) {
      console.error('Error fetching pricing rules:', error);
      return res.status(500).json({ error: 'Failed to fetch pricing rules' });
    }

    // Format the pricing rules to match the frontend's expected format
    const formattedPricingRules: PricingRule[] = data.map(rule => ({
      name: rule.name,
      hourlyRate: rule.hourly_rate,
      startTime: rule.start_time,
      endTime: rule.end_time,
      daysOfWeek: rule.days_of_week
    }));

    return res.json(formattedPricingRules);
  } catch (error) {
    console.error('Error in /pricing-rules endpoint:', error);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// Endpoint to get bookings for a specific date and location
app.get('/bookings', async (req, res) => {
  try {
    const { locationId, date } = req.query;

    if (!locationId || !date) {
      return res.status(400).json({ error: 'locationId and date are required query parameters' });
    }

    // Create UTC date range for the specified date
    const startOfDay = new Date(date as string);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date as string);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // Query the bookings for the specified date and location
    // Only get bookings that are entirely within the requested day
    const { data, error } = await supabase
      .from('bookings')
      .select('id, bay_id, start_time, end_time, status')
      .eq('location_id', locationId)
      .gte('start_time', startOfDay.toISOString())
      .lt('end_time', endOfDay.toISOString())
      .neq('status', 'cancelled')
      .neq('status', 'no_show')
      .neq('status', 'expired');

    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // Format the bookings to match the frontend's expected format
    const formattedBookings = data.map(booking => ({
      id: booking.id,
      bayId: booking.bay_id,
      startTime: new Date(booking.start_time).toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC' // Ensure consistent timezone handling
      }),
      endTime: new Date(booking.end_time).toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC' // Ensure consistent timezone handling
      })
    }));

    return res.json(formattedBookings);
  } catch (error) {
    console.error('Error in /bookings endpoint:', error);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

app.post('/calculate-price', async (req: Request, res: Response) => {
    const { locationId, startTime, endTime } = req.body;

    if (!locationId || !startTime || !endTime) {
        return res.status(400).json({ error: 'locationId, startTime, and endTime are required' });
    }

    try {
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
            return res.status(400).json({ error: 'Invalid startTime or endTime' });
        }

        const { data: rules, error: rulesError } = await supabase
            .from('pricing_rules')
            .select('name, hourly_rate, start_time, end_time, days_of_week')
            .eq('location_id', locationId);

        if (rulesError) throw rulesError;
        if (!rules || rules.length === 0) {
            return res.status(404).json({ error: 'No pricing rules found for this location' });
        }
        
        let total = 0;
        const breakdown = [];
        let cursorTime = new Date(startDate);
        
        let currentSegment: { rateName: string; start: string; rate: number; } | null = null;

        while (cursorTime < endDate) {
            const hour = cursorTime.getUTCHours();
            const minute = cursorTime.getUTCMinutes();
            
            // Determine which rate applies based on time
            let rule;
            if (hour >= 9 || hour < 2) {
                // Standard Rate: 9am-2am
                rule = rules.find(r => r.name === "Standard Rate");
            } else {
                // Off-Peak Rate: 2am-9am
                rule = rules.find(r => r.name === "Off-Peak Rate");
            }

            if (!rule) {
                return res.status(500).json({ error: `No pricing rule found for ${cursorTime.toISOString()}` });
            }

            const priceForSlot = (rule.hourly_rate * 100) / 4; // price in cents for 15 mins

            if (!currentSegment || currentSegment.rateName !== rule.name) {
                if (currentSegment) {
                    breakdown.push({
                        ...currentSegment,
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
                ...currentSegment,
                end: endDate.toISOString(),
            });
        }
        
        res.json({
            total: total,
            currency: 'usd',
            breakdown: breakdown,
        });

    } catch (error: any) {
        console.error('Error in /calculate-price:', error);
        res.status(500).json({ error: 'Failed to calculate price', details: error.message });
    }
});

// Endpoint to get bays per location and their status/availability
app.get('/bays', async (req, res) => {
  const { locationId } = req.query;

  if (!locationId) {
    return res.status(400).json({ error: 'Location ID is required' });
  }

  try {
    const { data, error } = await supabase
      .from('bays')
      .select('id, status, location_id, bay_number, name')
      .eq('location_id', locationId);

    if (error) {
      console.error('Error fetching bays:', error);
      return res.status(500).json({ error: 'Failed to fetch bays' });
    }

    return res.json(data);
  } catch (error) {
    console.error('Error in /bays endpoint:', error);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// Endpoint to check for existing reserved bookings for a user
app.get('/users/:userId/bookings/reserved', async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        // Get current time in UTC
        const now = new Date().toISOString();

        const { data, error } = await supabase
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
            bayName: (reservation.bays as any)?.name || 'N/A',
            bayNumber: (reservation.bays as any)?.bay_number || 'N/A'
        };

        return res.json({ reservation: formattedReservation });

    } catch (error: any) {
        console.error(`Error in /users/${userId}/bookings/reserved endpoint:`, error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

// Endpoint to get future user-specific bookings
app.get('/users/:userId/bookings/future', async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        // Get current time in user's timezone (EST/EDT)
        const now = new Date();
        const userTimezone = 'America/New_York';
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
        userTime.setHours(0, 0, 0, 0);
        const nowISO = userTime.toISOString();

        const { data, error } = await supabase
            .from('bookings')
            .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
            .eq('user_id', userId)
            .gte('start_time', nowISO)
            .not('status', 'in', '("reserved","expired")')
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Error fetching future user bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch future user bookings' });
        }

        const formattedBookings = data.map((booking: any) => ({
            id: booking.id,
            startTime: booking.start_time,
            endTime: booking.end_time,
            totalAmount: booking.total_amount,
            status: booking.status,
            bayName: booking.bays?.name || 'N/A',
            bayNumber: booking.bays?.bay_number || 'N/A'
        }));

        return res.json(formattedBookings);

    } catch (error: any) {
        console.error(`Error in /users/${userId}/bookings/future endpoint:`, error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

// Endpoint to get past user-specific bookings
app.get('/users/:userId/bookings/past', async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        // Get current time in user's timezone (EST/EDT)
        const now = new Date();
        const userTimezone = 'America/New_York';
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
        userTime.setHours(0, 0, 0, 0);
        const nowISO = userTime.toISOString();

        const { data, error } = await supabase
            .from('bookings')
            .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
            .eq('user_id', userId)
            .lt('start_time', nowISO)
            .order('start_time', { ascending: false });

        if (error) {
            console.error('Error fetching past user bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch past user bookings' });
        }

        const formattedBookings = data.map((booking: any) => ({
            id: booking.id,
            startTime: booking.start_time,
            endTime: booking.end_time,
            totalAmount: booking.total_amount,
            status: booking.status,
            bayName: booking.bays?.name || 'N/A',
            bayNumber: booking.bays?.bay_number || 'N/A'
        }));

        return res.json(formattedBookings);

    } catch (error: any) {
        console.error(`Error in /users/${userId}/bookings/past endpoint:`, error);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// =====================================================
// SERVER START
// =====================================================

app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`)); 