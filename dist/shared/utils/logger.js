"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
exports.logger = (0, pino_1.default)(Object.assign({ level: process.env.LOG_LEVEL || 'info', redact: {
        paths: [
            'email', '*.email',
            'signerEmail', '*.signerEmail',
            'playerEmail', '*.playerEmail',
            'userEmail', '*.userEmail',
            'recipientEmail', '*.recipientEmail',
            'invitedEmail', '*.invitedEmail',
            'signer_email', '*.signer_email',
            'phone', '*.phone',
            'phoneWithCountryCode', '*.phoneWithCountryCode',
            'card_last_four', '*.card_last_four',
            '*.last4',
            'ip_address', '*.ip_address',
            'stripe_customer_id', '*.stripe_customer_id',
        ],
        censor: '[REDACTED]',
    } }, (process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino/file', options: { destination: 1 } },
})));
