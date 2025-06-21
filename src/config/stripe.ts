import Stripe from 'stripe';
import { validateEnvironment } from './environment';

const config = validateEnvironment();

export const stripe = new Stripe(config.stripe.secretKey);
export const webhookSecret = config.stripe.webhookSecret; 