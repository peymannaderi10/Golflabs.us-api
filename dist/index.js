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
dotenv_1.default.config();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
    console.error("Stripe secret key not found. Make sure you have a .env file with STRIPE_SECRET_KEY set.");
    process.exit(1);
}
const stripe = new stripe_1.default(stripeSecretKey);
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = 4242;
app.post('/create-payment-intent', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).send({ error: 'Invalid amount' });
    }
    try {
        const paymentIntent = yield stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            automatic_payment_methods: {
                enabled: true,
            },
        });
        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    }
    catch (error) {
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
app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));
