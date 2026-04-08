"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.businessRoutes = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const business_controller_1 = require("./business.controller");
const stripe_connect_controller_1 = require("./stripe-connect.controller");
const auth_middleware_1 = require("../auth/auth.middleware");
exports.businessRoutes = (0, express_1.Router)();
const controller = new business_controller_1.BusinessController();
const stripeConnectController = new stripe_connect_controller_1.StripeConnectController();
/**
 * Key rate limits on IP + normalized email where available. The email
 * fingerprint prevents a single attacker from rotating IPs to bypass the
 * limit for one target account, while still catching IP-only floods.
 */
function ipPlusEmailKey(req) {
    var _a, _b, _c, _d;
    const ip = (0, express_rate_limit_1.ipKeyGenerator)((_a = req.ip) !== null && _a !== void 0 ? _a : 'unknown');
    const email = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.email) === 'string'
        ? req.body.email.toLowerCase().trim()
        : typeof ((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.owner) === null || _d === void 0 ? void 0 : _d.email) === 'string'
            ? req.body.owner.email.toLowerCase().trim()
            : '';
    return email ? `${ip}|${email}` : ip;
}
const startSignupLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipPlusEmailKey,
    message: { success: false, error: 'Too many signup attempts, please try again later' },
});
const verifySignupLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 min window matches OTP TTL
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipPlusEmailKey,
    message: { success: false, error: 'Too many verification attempts, please try again later' },
});
/**
 * Per-authenticated-user limiter on location creation. Keyed on the
 * authenticated user id (set by authenticateEmployee) rather than IP so
 * coworkers behind a NAT are not collectively throttled.
 */
const createLocationLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        var _a, _b, _c;
        const authReq = req;
        return (_b = (_a = authReq.employeeProfile) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : (0, express_rate_limit_1.ipKeyGenerator)((_c = req.ip) !== null && _c !== void 0 ? _c : 'unknown');
    },
    message: { success: false, error: 'Too many location creation attempts, please try again later' },
});
exports.businessRoutes.post('/signup/start', startSignupLimiter, controller.startSignup);
exports.businessRoutes.post('/signup/verify', verifySignupLimiter, controller.verifySignup);
exports.businessRoutes.post('/locations', auth_middleware_1.authenticateEmployee, createLocationLimiter, controller.createLocation);
// ---------------------------------------------------------------------------
// Stripe Connect onboarding (Express accounts)
// ---------------------------------------------------------------------------
// All four endpoints are scoped per location and protected by the standard
// employee + tenant-scope guards. The controller additionally enforces
// owner/admin role since billing setup is privileged.
const stripeConnectGuards = [auth_middleware_1.authenticateEmployee, auth_middleware_1.enforceLocationScope];
exports.businessRoutes.get('/locations/:locationId/stripe-connect/status', ...stripeConnectGuards, stripeConnectController.getStatus);
exports.businessRoutes.post('/locations/:locationId/stripe-connect/onboard', ...stripeConnectGuards, stripeConnectController.startOnboarding);
exports.businessRoutes.post('/locations/:locationId/stripe-connect/dashboard', ...stripeConnectGuards, stripeConnectController.openDashboard);
exports.businessRoutes.post('/locations/:locationId/stripe-connect/refresh', ...stripeConnectGuards, stripeConnectController.refreshStatus);
exports.businessRoutes.delete('/locations/:locationId/stripe-connect', ...stripeConnectGuards, stripeConnectController.disconnect);
