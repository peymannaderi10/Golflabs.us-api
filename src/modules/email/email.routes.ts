import { Router } from 'express';
import { handleResendWebhook } from './email.webhooks';

const router = Router();

// Resend webhook endpoint
router.post('/webhooks/resend', handleResendWebhook);

export default router; 