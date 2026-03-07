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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleResendWebhook = handleResendWebhook;
const svix_1 = require("svix");
const resend_1 = require("../../config/resend");
const notification_service_1 = require("./notification.service");
const marketing_service_1 = require("../marketing/marketing.service");
function handleResendWebhook(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!resend_1.resendConfig.webhookSecret) {
            console.error('Resend webhook secret not configured');
            return res.status(400).send('Webhook secret not configured');
        }
        const svixId = req.headers['svix-id'];
        const svixTimestamp = req.headers['svix-timestamp'];
        const svixSignature = req.headers['svix-signature'];
        if (!svixId || !svixTimestamp || !svixSignature) {
            console.error('Missing Svix webhook headers');
            return res.status(400).send('Missing webhook headers');
        }
        try {
            const payload = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
            const wh = new svix_1.Webhook(resend_1.resendConfig.webhookSecret);
            const event = wh.verify(payload, {
                'svix-id': svixId,
                'svix-timestamp': svixTimestamp,
                'svix-signature': svixSignature,
            });
            yield processWebhookEvent(event);
            res.status(200).json({ received: true });
        }
        catch (error) {
            console.error('Webhook verification failed:', error.message || error);
            res.status(400).send('Invalid webhook signature');
        }
    });
}
function processWebhookEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const messageId = event.data.email_id || event.data.message_id;
        if (!messageId) {
            console.warn('Webhook event missing email_id/message_id:', JSON.stringify(event.data));
            return;
        }
        console.log(`Processing Resend webhook: ${event.type} for message ${messageId}`);
        switch (event.type) {
            case 'email.sent':
                break;
            case 'email.delivered':
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'delivered', new Date(event.created_at));
                yield marketing_service_1.MarketingService.processTrackingWebhook(messageId, event.type);
                console.log(`Email ${messageId} delivered`);
                break;
            case 'email.bounced':
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'bounced');
                yield marketing_service_1.MarketingService.processTrackingWebhook(messageId, event.type);
                console.log(`Email ${messageId} bounced`);
                break;
            case 'email.complained':
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'complained');
                console.log(`Email ${messageId} marked as spam`);
                break;
            case 'email.opened':
            case 'email.clicked':
                yield marketing_service_1.MarketingService.processTrackingWebhook(messageId, event.type);
                console.log(`Email ${messageId} ${event.type === 'email.opened' ? 'opened' : 'clicked'}`);
                break;
            default:
                console.log(`Unhandled Resend webhook event type: ${event.type}`);
        }
    });
}
