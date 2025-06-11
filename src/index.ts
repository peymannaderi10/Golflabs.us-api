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

interface PaymentRequestBody {
    amount: number; // Expect amount in cents
}

app.post('/create-payment-intent', async (req: Request, res: Response) => {
    const { amount } = req.body as PaymentRequestBody;

    if (!amount || amount <= 0) {
        return res.status(400).send({ error: 'Invalid amount' });
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            automatic_payment_methods: {
                enabled: true,
            },
        });

        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error: any) {
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