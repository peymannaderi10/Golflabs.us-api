import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.error("Stripe secret key not found. Make sure you have a .env file with STRIPE_SECRET_KEY set.");
    process.exit(1);
}

const stripe = new Stripe(stripeSecretKey);
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 4242;

interface BookingDetails {
    date: string;
    bayId: number;
    startTime: string;
    endTime: string;
    duration: string;
}

interface PaymentRequestBody {
    amount: number; // Expect amount in cents
    bookingDetails: BookingDetails;
}

app.post('/create-payment-intent', async (req: Request, res: Response) => {
    const { amount, bookingDetails } = req.body as PaymentRequestBody;

    if (!amount || amount <= 0) {
        return res.status(400).send({ error: 'Invalid amount' });
    }

    if (!bookingDetails) {
        return res.status(400).send({ error: 'Booking details are required' });
    }

    try {
        const date = new Date(bookingDetails.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const metadata = {
            bay_id: bookingDetails.bayId.toString(),
            booking_date: bookingDetails.date,
            start_time: bookingDetails.startTime,
            end_time: bookingDetails.endTime,
            duration: bookingDetails.duration,
            year: date.getFullYear().toString(),
            month: (date.getMonth() + 1).toString(),
            day: date.getDate().toString(),
            formatted_date: formattedDate,
        };

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: metadata,
        });

        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error: any) {
        console.error("Error creating payment intent:", error);
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

app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`)); 