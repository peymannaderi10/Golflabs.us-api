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
exports.handleResendWebhook = handleResendWebhook;
const crypto_1 = __importDefault(require("crypto"));
const resend_1 = require("../../config/resend");
const notification_service_1 = require("./notification.service");
function handleResendWebhook(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!resend_1.resendConfig.webhookSecret) {
            console.error('Resend webhook secret not configured');
            return res.status(400).send('Webhook secret not configured');
        }
        // Verify webhook signature
        const signature = req.headers['resend-signature'];
        if (!signature) {
            console.error('Missing Resend webhook signature');
            return res.status(400).send('Missing signature');
        }
        try {
            // Extract timestamp and signature from header
            const elements = signature.split(',');
            const timestamp = (_a = elements.find(e => e.startsWith('t='))) === null || _a === void 0 ? void 0 : _a.split('=')[1];
            const sig = (_b = elements.find(e => e.startsWith('v1='))) === null || _b === void 0 ? void 0 : _b.split('=')[1];
            if (!timestamp || !sig) {
                console.error('Invalid signature format');
                return res.status(400).send('Invalid signature format');
            }
            // Create expected signature
            const payload = `${timestamp}.${JSON.stringify(req.body)}`;
            const expectedSignature = crypto_1.default
                .createHmac('sha256', resend_1.resendConfig.webhookSecret)
                .update(payload)
                .digest('hex');
            // Verify signature
            if (sig !== expectedSignature) {
                console.error('Invalid webhook signature');
                return res.status(400).send('Invalid signature');
            }
            // Process the webhook event
            const event = req.body;
            yield processWebhookEvent(event);
            res.status(200).json({ received: true });
        }
        catch (error) {
            console.error('Error processing Resend webhook:', error);
            res.status(500).send('Internal server error');
        }
    });
}
function processWebhookEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
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
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'delivered', new Date(event.created_at));
                console.log(`Email ${messageId} delivered`);
                break;
            case 'email.bounced':
                // Email bounced (invalid email address, etc.)
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'bounced');
                console.log(`Email ${messageId} bounced`);
                break;
            case 'email.complained':
                // Recipient marked email as spam
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'complained');
                console.log(`Email ${messageId} marked as spam`);
                break;
            default:
                console.log(`Unhandled Resend webhook event type: ${event.type}`);
        }
    });
}
