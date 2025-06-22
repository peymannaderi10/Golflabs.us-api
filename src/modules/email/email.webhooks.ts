import { Request, Response } from 'express';
import crypto from 'crypto';
import { resendConfig } from '../../config/resend';
import { NotificationService } from './notification.service';
import { ResendWebhookEvent } from './email.types';

export async function handleResendWebhook(req: Request, res: Response) {
  if (!resendConfig.webhookSecret) {
    console.error('Resend webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  // Verify webhook signature
  const signature = req.headers['resend-signature'] as string;
  if (!signature) {
    console.error('Missing Resend webhook signature');
    return res.status(400).send('Missing signature');
  }

  try {
    // Extract timestamp and signature from header
    const elements = signature.split(',');
    const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
    const sig = elements.find(e => e.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !sig) {
      console.error('Invalid signature format');
      return res.status(400).send('Invalid signature format');
    }

    // Create expected signature
    const payload = `${timestamp}.${JSON.stringify(req.body)}`;
    const expectedSignature = crypto
      .createHmac('sha256', resendConfig.webhookSecret)
      .update(payload)
      .digest('hex');

    // Verify signature
    if (sig !== expectedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    // Process the webhook event
    const event = req.body as ResendWebhookEvent;
    await processWebhookEvent(event);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Resend webhook:', error);
    res.status(500).send('Internal server error');
  }
}

async function processWebhookEvent(event: ResendWebhookEvent) {
  const messageId = event.data.message_id;
  
  if (!messageId) {
    console.warn('Webhook event missing message_id');
    return;
  }

  console.log(`Processing Resend webhook: ${event.type} for message ${messageId}`);

  switch (event.type) {
    case 'email.sent':
      // Email was sent successfully by Resend
      // We already mark as 'sent' when we get the API response, so no action needed
      break;

    case 'email.delivered':
      // Email was delivered to recipient's inbox
      await NotificationService.updateFromWebhook(
        messageId,
        'delivered',
        new Date(event.created_at)
      );
      console.log(`Email ${messageId} delivered`);
      break;

    case 'email.bounced':
      // Email bounced (invalid email address, etc.)
      await NotificationService.updateFromWebhook(messageId, 'bounced');
      console.log(`Email ${messageId} bounced`);
      break;

    case 'email.complained':
      // Recipient marked email as spam
      await NotificationService.updateFromWebhook(messageId, 'complained');
      console.log(`Email ${messageId} marked as spam`);
      break;

    default:
      console.log(`Unhandled Resend webhook event type: ${event.type}`);
  }
} 