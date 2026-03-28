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
exports.authenticateKioskOrEmployee = exports.authenticateKiosk = exports.authenticateEmployee = exports.authenticateUser = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
/**
 * Validates a Supabase JWT and sets req.user. Any authenticated user passes.
 */
const authenticateUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        const { data: { user }, error } = yield database_1.supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    }
    catch (error) {
        logger_1.logger.error({ err: error }, 'User authentication error');
        return res.status(401).json({ error: 'Authentication failed' });
    }
});
exports.authenticateUser = authenticateUser;
/**
 * Validates a Supabase JWT and verifies the user has an employee or admin role.
 * Sets req.user and req.employeeProfile on success.
 */
const authenticateEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        const { data: { user }, error } = yield database_1.supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        const { data: profile, error: profileError } = yield database_1.supabase
            .from('user_profiles')
            .select('id, email, full_name, role, location_id')
            .eq('id', user.id)
            .single();
        if (profileError || !profile) {
            return res.status(401).json({ error: 'User profile not found' });
        }
        if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
            return res.status(403).json({ error: 'Employee access required' });
        }
        req.user = user;
        req.employeeProfile = profile;
        next();
    }
    catch (error) {
        logger_1.logger.error({ err: error }, 'Employee authentication error');
        return res.status(401).json({ error: 'Authentication failed' });
    }
});
exports.authenticateEmployee = authenticateEmployee;
/**
 * Validates a kiosk API key sent via X-Kiosk-Key header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
const authenticateKiosk = (req, res, next) => {
    const kioskKey = req.headers['x-kiosk-key'];
    const expectedKey = process.env.KIOSK_API_KEY;
    if (!expectedKey) {
        logger_1.logger.error('KIOSK_API_KEY not configured on the server');
        return res.status(500).json({ error: 'Kiosk authentication not configured' });
    }
    if (!kioskKey) {
        return res.status(401).json({ error: 'Kiosk API key required' });
    }
    const keyBuffer = Buffer.from(kioskKey);
    const expectedBuffer = Buffer.from(expectedKey);
    if (keyBuffer.length !== expectedBuffer.length || !crypto_1.default.timingSafeEqual(keyBuffer, expectedBuffer)) {
        return res.status(401).json({ error: 'Invalid kiosk API key' });
    }
    req.isKiosk = true;
    next();
};
exports.authenticateKiosk = authenticateKiosk;
/**
 * Accepts either a valid kiosk API key (X-Kiosk-Key) or employee JWT.
 */
const authenticateKioskOrEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const kioskKey = req.headers['x-kiosk-key'];
    if (kioskKey) {
        return (0, exports.authenticateKiosk)(req, res, next);
    }
    return (0, exports.authenticateEmployee)(req, res, next);
});
exports.authenticateKioskOrEmployee = authenticateKioskOrEmployee;
