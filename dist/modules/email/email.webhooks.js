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
const logger_1 = require("../../shared/utils/logger");
function handleResendWebhook(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!resend_1.resendConfig.webhookSecret) {
            logger_1.logger.error('Resend webhook secret not configured');
            return res.status(400).send('Webhook secret not configured');
        }
        const svixId = req.headers['svix-id'];
        const svixTimestamp = req.headers['svix-timestamp'];
        const svixSignature = req.headers['svix-signature'];
        if (!svixId || !svixTimestamp || !svixSignature) {
            logger_1.logger.error('Missing Svix webhook headers');
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
            logger_1.logger.error({ err: error }, 'Webhook verification failed');
            res.status(400).send('Invalid webhook signature');
        }
    });
}
function processWebhookEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const messageId = event.data.email_id || event.data.message_id;
        if (!messageId) {
            logger_1.logger.warn({ eventData: event.data }, 'Webhook event missing email_id/message_id');
            return;
        }
        logger_1.logger.info({ eventType: event.type, messageId }, 'Processing Resend webhook');
        switch (event.type) {
            case 'email.sent':
                break;
            case 'email.delivered':
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'delivered', new Date(event.created_at));
                yield marketing_service_1.MarketingService.processTrackingWebhook(messageId, event.type);
                logger_1.logger.info({ messageId }, 'Email delivered');
                break;
            case 'email.bounced':
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'bounced');
                yield marketing_service_1.MarketingService.processTrackingWebhook(messageId, event.type);
                logger_1.logger.info({ messageId }, 'Email bounced');
                break;
            case 'email.complained':
                yield notification_service_1.NotificationService.updateFromWebhook(messageId, 'complained');
                logger_1.logger.info({ messageId }, 'Email marked as spam');
                break;
            case 'email.opened':
            case 'email.clicked':
                yield marketing_service_1.MarketingService.processTrackingWebhook(messageId, event.type);
                logger_1.logger.info({ messageId, eventType: event.type }, 'Email tracking event');
                break;
            default:
                logger_1.logger.info({ eventType: event.type }, 'Unhandled Resend webhook event type');
        }
    });
}
