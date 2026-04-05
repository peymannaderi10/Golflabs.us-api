"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnlockToken = createUnlockToken;
exports.verifyUnlockToken = verifyUnlockToken;
const crypto_1 = __importDefault(require("crypto"));
function getUnlockTokenSecret() {
    const secret = process.env.UNLOCK_TOKEN_SECRET;
    if (!secret) {
        throw new Error('UNLOCK_TOKEN_SECRET environment variable is required');
    }
    return secret;
}
const UNLOCK_TOKEN_SECRET = getUnlockTokenSecret();
function createUnlockToken(bookingId, startTime, endTime) {
    const payload = {
        bookingId,
        startTime,
        endTime,
        expires: new Date(endTime).getTime(),
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto_1.default
        .createHmac('sha256', UNLOCK_TOKEN_SECRET)
        .update(data)
        .digest('base64url');
    return `${data}.${signature}`;
}
function verifyUnlockToken(token) {
    const parts = token.split('.');
    if (parts.length !== 2)
        return null;
    const [data, signature] = parts;
    const expectedSig = crypto_1.default
        .createHmac('sha256', UNLOCK_TOKEN_SECRET)
        .update(data)
        .digest('base64url');
    if (expectedSig.length !== signature.length)
        return null;
    if (!crypto_1.default.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature)))
        return null;
    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
        if (!payload.bookingId || !payload.expires)
            return null;
        return payload;
    }
    catch (_a) {
        return null;
    }
}
