import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const resendConfig = {
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  fromEmail: process.env.RESEND_FROM_EMAIL || 'Golf Labs US <noreply@golflabs.us>',
  frontendUrl: process.env.FRONTEND_URL || 'https://golflabs.us'
}; 