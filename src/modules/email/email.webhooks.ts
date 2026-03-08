import { Request, Response } from 'express';
import { Webhook } from 'svix';
import { resendConfig } from '../../config/resend';
import { NotificationService } from './notification.service';
import { MarketingService } from '../marketing/marketing.service';
import { ResendWebhookEvent } from './email.types';
import { logger } from '../../shared/utils/logger';

export async function handleResendWebhook(req: Request, res: Response) {
  if (!resendConfig.webhookSecret) {
    logger.error('Resend webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  const svixId = req.headers['svix-id'] as string;
  const svixTimestamp = req.headers['svix-timestamp'] as string;
  const svixSignature = req.headers['svix-signature'] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.error('Missing Svix webhook headers');
    return res.status(400).send('Missing webhook headers');
  }

  try {
    const payload = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);

    const wh = new Webhook(resendConfig.webhookSecret);
    const event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent;

    await processWebhookEvent(event);
    res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Webhook verification failed');
    res.status(400).send('Invalid webhook signature');
  }
}

async function processWebhookEvent(event: ResendWebhookEvent) {
  const messageId = event.data.email_id || event.data.message_id;
  
  if (!messageId) {
    logger.warn({ eventData: event.data }, 'Webhook event missing email_id/message_id');
    return;
  }

  logger.info({ eventType: event.type, messageId }, 'Processing Resend webhook');

  switch (event.type) {
    case 'email.sent':
      break;

    case 'email.delivered':
      await NotificationService.updateFromWebhook(
        messageId,
        'delivered',
        new Date(event.created_at)
      );
      await MarketingService.processTrackingWebhook(messageId, event.type);
      logger.info({ messageId }, 'Email delivered');
      break;

    case 'email.bounced':
      await NotificationService.updateFromWebhook(messageId, 'bounced');
      await MarketingService.processTrackingWebhook(messageId, event.type);
      logger.info({ messageId }, 'Email bounced');
      break;

    case 'email.complained':
      await NotificationService.updateFromWebhook(messageId, 'complained');
      logger.info({ messageId }, 'Email marked as spam');
      break;

    case 'email.opened':
    case 'email.clicked':
      await MarketingService.processTrackingWebhook(messageId, event.type);
      logger.info({ messageId, eventType: event.type }, 'Email tracking event');
      break;

    default:
      logger.info({ eventType: event.type }, 'Unhandled Resend webhook event type');
  }
}
