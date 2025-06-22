"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const email_webhooks_1 = require("./email.webhooks");
const router = (0, express_1.Router)();
// Resend webhook endpoint
router.post('/webhooks/resend', email_webhooks_1.handleResendWebhook);
exports.default = router;
