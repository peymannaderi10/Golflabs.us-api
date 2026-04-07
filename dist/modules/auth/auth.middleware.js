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
exports.authenticateKioskOrEmployee = exports.requireEmployee = exports.resolveResourceLocation = exports.enforceLocationScopeOptional = exports.enforceLocationScope = exports.authenticateKiosk = exports.authenticateEmployee = exports.authenticateUser = void 0;
exports.invalidateEmployeeProfileCache = invalidateEmployeeProfileCache;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
// =====================================================================
// LOCAL JWT VERIFICATION + PROFILE CACHE
// =====================================================================
//
// Supabase issues HS256 JWTs signed with `SUPABASE_JWT_SECRET`. Verifying
// them locally eliminates the `supabase.auth.getUser(token)` round-trip
// on every request — at 1000 RPM this is thousands of saved calls.
//
// After local verification, we still have to resolve the employee profile
// (user_profiles + client_members). We cache that resolved profile in a
// process-local LRU keyed on the user id with a short TTL. Cache is
// invalidated on logout (best-effort — if we miss, it expires on TTL).
//
// If `SUPABASE_JWT_SECRET` is not configured, we fall back to
// `supabase.auth.getUser()` so local dev without the secret still works.
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const PROFILE_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const PROFILE_CACHE_MAX_ENTRIES = 10000;
/**
 * Tiny in-memory LRU-ish cache (insertion-order via Map). No external deps.
 * Evicts expired entries on read; enforces a hard size cap by dropping the
 * oldest entry when the map reaches capacity.
 */
const profileCache = new Map();
function cacheGet(userId) {
    const entry = profileCache.get(userId);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        profileCache.delete(userId);
        return null;
    }
    // Re-insert to bump recency (Map preserves insertion order).
    profileCache.delete(userId);
    profileCache.set(userId, entry);
    return entry;
}
function cacheSet(userId, entry) {
    if (profileCache.size >= PROFILE_CACHE_MAX_ENTRIES) {
        const oldest = profileCache.keys().next().value;
        if (oldest)
            profileCache.delete(oldest);
    }
    profileCache.set(userId, entry);
}
/** Invalidate a cached profile. Call on logout, role change, membership update. */
function invalidateEmployeeProfileCache(userId) {
    profileCache.delete(userId);
}
/**
 * Base64url decode (Node's `base64url` encoding handles the URL-safe
 * alphabet and missing padding automatically since Node 16).
 */
function base64urlDecode(input) {
    return Buffer.from(input, 'base64url');
}
/**
 * Verify an HS256 Supabase JWT locally. Returns the payload on success or
 * `null` on any failure (signature mismatch, expired, malformed, wrong alg).
 * Does NOT throw — callers check for null.
 */
function verifySupabaseJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const [headerB64, payloadB64, signatureB64] = parts;
        const header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
        if (header.alg !== 'HS256' || header.typ !== 'JWT')
            return null;
        const expected = crypto_1.default
            .createHmac('sha256', secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest();
        const provided = base64urlDecode(signatureB64);
        if (expected.length !== provided.length)
            return null;
        if (!crypto_1.default.timingSafeEqual(expected, provided))
            return null;
        const payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
        if (!payload.sub)
            return null;
        const nowSec = Math.floor(Date.now() / 1000);
        if (typeof payload.exp !== 'number' || payload.exp <= nowSec)
            return null;
        return payload;
    }
    catch (_a) {
        return null;
    }
}
/**
 * Resolve user identity from a bearer token. Fast path: local HS256 verify
 * if `SUPABASE_JWT_SECRET` is set. Slow path: delegates to
 * `supabase.auth.getUser()` (network round-trip to Supabase).
 *
 * Returns `{ id, email }` on success, or `null` on any failure.
 */
function resolveUserFromToken(token) {
    return __awaiter(this, void 0, void 0, function* () {
        if (JWT_SECRET) {
            const payload = verifySupabaseJWT(token, JWT_SECRET);
            if (payload)
                return { id: payload.sub, email: payload.email };
            return null;
        }
        // Fallback: remote verification.
        const { data: { user }, error } = yield database_1.supabase.auth.getUser(token);
        if (error || !user)
            return null;
        return { id: user.id, email: user.email };
    });
}
/**
 * Load an employee profile + accessible locations from the database.
 * Used on cache miss in `authenticateEmployee`. Returns `null` for any
 * failure (not found, wrong role, multi-client config).
 */
function loadEmployeeProfile(userId, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const { data: profile, error: profileError } = yield database_1.supabase
            .from('user_profiles')
            .select('id, email, full_name, role, location_id')
            .eq('id', userId)
            .single();
        if (profileError || !profile)
            return null;
        // INVARIANT: user_profiles.role is one of 'customer' | 'employee' | 'admin'.
        // Business owners have user_profiles.role='admin' and client_members.role='owner'.
        if (profile.role !== 'employee' && profile.role !== 'admin')
            return 'not_employee';
        const { data: memberships } = yield database_1.supabase
            .from('client_members')
            .select('client_id, role, location_id')
            .eq('user_id', userId);
        let clientId = '';
        let clientRole = 'employee';
        let accessibleLocationIds = [];
        if (memberships && memberships.length > 0) {
            const uniqueClients = new Set(memberships.map(m => m.client_id));
            if (uniqueClients.size > 1) {
                logger_1.logger.error({ userId }, 'Employee has memberships across multiple clients');
                return 'misconfigured';
            }
            clientId = memberships[0].client_id;
            const roles = memberships.map(m => m.role);
            if (roles.includes('owner'))
                clientRole = 'owner';
            else if (roles.includes('admin'))
                clientRole = 'admin';
            accessibleLocationIds = memberships
                .map(m => m.location_id)
                .filter((id) => typeof id === 'string' && id.length > 0);
        }
        else if (profile.location_id) {
            // Backward compat: fallback to user_profiles.location_id.
            const { data: loc } = yield database_1.supabase
                .from('locations')
                .select('id')
                .eq('id', profile.location_id)
                .eq('status', 'active')
                .is('deleted_at', null)
                .maybeSingle();
            if (loc)
                accessibleLocationIds = [loc.id];
        }
        return {
            id: profile.id,
            email: (_b = (_a = profile.email) !== null && _a !== void 0 ? _a : userEmail) !== null && _b !== void 0 ? _b : '',
            full_name: profile.full_name,
            role: profile.role,
            location_id: profile.location_id,
            clientId,
            clientRole,
            accessibleLocationIds,
        };
    });
}
/**
 * Validates a Supabase JWT and sets req.user. Any authenticated user passes.
 * Uses local HS256 verification when `SUPABASE_JWT_SECRET` is set (zero
 * network calls); falls back to `supabase.auth.getUser()` otherwise.
 */
const authenticateUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        const identity = yield resolveUserFromToken(token);
        if (!identity) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = { id: identity.id, email: identity.email };
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
 * Sets `req.user` and `req.employeeProfile` on success.
 *
 * ## Performance
 *
 *   1. JWT verification: local HMAC-SHA256 when `SUPABASE_JWT_SECRET` is
 *      set (zero network calls). Falls back to `supabase.auth.getUser()`
 *      if the secret isn't configured.
 *
 *   2. Profile lookup: served from an in-memory cache with a 60-second TTL.
 *      Cache misses hit the database (user_profiles + client_members, plus
 *      an optional locations fallback). At steady state, the majority of
 *      requests are zero-DB-call auth.
 *
 * Invalidate the cache on logout or role/membership change by calling
 * `invalidateEmployeeProfileCache(userId)`.
 */
const authenticateEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        // 1. Identity. Local HS256 verify (fast) or Supabase round-trip (fallback).
        const identity = yield resolveUserFromToken(token);
        if (!identity) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        // 2. Profile. Cache hit → done. Cache miss → load + store.
        const cached = cacheGet(identity.id);
        if (cached) {
            req.user = cached.minimalUser;
            req.employeeProfile = cached.profile;
            return next();
        }
        const loaded = yield loadEmployeeProfile(identity.id, identity.email);
        if (loaded === null) {
            return res.status(401).json({ error: 'User profile not found' });
        }
        if (loaded === 'not_employee') {
            return res.status(403).json({ error: 'Employee access required' });
        }
        if (loaded === 'misconfigured') {
            return res.status(403).json({ error: 'Account configuration error — contact support' });
        }
        const minimalUser = { id: identity.id, email: identity.email };
        cacheSet(identity.id, {
            profile: loaded,
            minimalUser,
            expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        });
        req.user = minimalUser;
        req.employeeProfile = loaded;
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
 * FRONT-DOOR LOCATION SCOPE ENFORCEMENT
 * =====================================
 *
 * Defense-in-depth tenant isolation that runs after `authenticateEmployee`.
 *
 * ## Design principles
 *
 *   1. **Fail-closed by default.** `enforceLocationScope` REQUIRES a
 *      `locationId` to be discoverable in the request. If none is present,
 *      the request is rejected with 400. Routes that are genuinely
 *      self-scoped (e.g. `/employee/accessible-locations`, `/employee/me`)
 *      must opt out explicitly via `enforceLocationScopeOptional`.
 *
 *   2. **Resource-param routes resolve first.** Routes identified by an
 *      internal resource id (`:ruleId`, `:spaceId`) prepend
 *      `resolveResourceLocation(...)` which whitelists the table, does a
 *      soft-delete-aware lookup, and stashes the owning locationId on
 *      `req.targetLocationId`. The subsequent `enforceLocationScope` then
 *      validates membership.
 *
 *   3. **No enumeration oracle.** Cross-tenant access on resource-param
 *      routes returns 404 — same as "doesn't exist" — so an attacker with
 *      a valid employee JWT at tenant A cannot distinguish "UUID belongs
 *      to tenant B" from "UUID doesn't exist" by observing response codes.
 *      For explicit `locationId` query/body/params routes we still return
 *      403 because the caller already knew the id.
 *
 *   4. **Whitelisted resources only.** `resolveResourceLocation` rejects
 *      any table name not present in `RESOURCE_TABLE_MAP`. A typo fails at
 *      startup (or first call), not silently in production. A future
 *      refactor that accidentally passes user input cannot inject arbitrary
 *      table names.
 */
/**
 * Whitelist of tables the resolver is allowed to query. Every entry must
 * map a resource table to:
 *   - `column`: the foreign key column holding the owning `location_id`
 *   - `softDelete`: whether the table has a `deleted_at` column to filter
 *
 * Add new resource-param routes here, not inline in route files.
 */
const RESOURCE_TABLE_MAP = {
    pricing_rules: { column: 'location_id', softDelete: false },
    user_types: { column: 'location_id', softDelete: false },
    spaces: { column: 'location_id', softDelete: true },
    space_closures: { column: 'location_id', softDelete: false },
    bookings: { column: 'location_id', softDelete: false },
    promotions: { column: 'location_id', softDelete: false },
    marketing_campaigns: { column: 'location_id', softDelete: false },
    email_templates: { column: 'location_id', softDelete: false },
    membership_plans: { column: 'location_id', softDelete: true },
    memberships: { column: 'location_id', softDelete: false },
    leagues: { column: 'location_id', softDelete: true },
};
/**
 * Front-door enforcement middleware. Auto-discovers `locationId` from:
 *
 *     1. req.targetLocationId   (populated by `resolveResourceLocation`)
 *     2. req.params.locationId
 *     3. req.body.locationId
 *     4. req.query.locationId
 *
 * Fail-closed: if none are present, returns 400. Use
 * `enforceLocationScopeOptional` for self-scoped endpoints that genuinely
 * don't carry a locationId.
 */
const enforceLocationScope = (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const accessibleIds = (_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.accessibleLocationIds;
    if (!accessibleIds) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const requested = (_f = (_d = (_b = req.targetLocationId) !== null && _b !== void 0 ? _b : (_c = req.params) === null || _c === void 0 ? void 0 : _c.locationId) !== null && _d !== void 0 ? _d : (_e = req.body) === null || _e === void 0 ? void 0 : _e.locationId) !== null && _f !== void 0 ? _f : (_g = req.query) === null || _g === void 0 ? void 0 : _g.locationId;
    if (!requested) {
        return res.status(400).json({ error: 'locationId is required' });
    }
    if (typeof requested !== 'string') {
        return res.status(400).json({ error: 'Invalid locationId format' });
    }
    if (!accessibleIds.includes(requested)) {
        logger_1.logger.warn({ userId: (_h = req.user) === null || _h === void 0 ? void 0 : _h.id, requested, path: req.path, resolved: Boolean(req.targetLocationId) }, 'Employee denied cross-tenant locationId access');
        // For resource-param routes the resolver already confirmed the row
        // exists. Returning 403 here would let an attacker enumerate resource
        // ids across tenants. Collapse to 404 in that case.
        if (req.targetLocationId) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        return res.status(403).json({ error: 'Access denied: you do not have access to this location' });
    }
    next();
};
exports.enforceLocationScope = enforceLocationScope;
/**
 * Opt-in pass-through variant of `enforceLocationScope`. Use ONLY for
 * endpoints that are genuinely self-scoped (identity-only, no location
 * dimension) such as `/employee/accessible-locations` or `/employee/me`.
 * Still requires `authenticateEmployee` upstream.
 */
const enforceLocationScopeOptional = (req, res, next) => {
    if (!req.employeeProfile) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};
exports.enforceLocationScopeOptional = enforceLocationScopeOptional;
/**
 * Factory: resolves the owning `locationId` for a resource-param route
 * and stashes it on `req.targetLocationId` so the downstream
 * `enforceLocationScope` can validate tenant membership.
 *
 *     router.put(
 *       '/pricing-rules/:ruleId',
 *       authenticateEmployee,
 *       resolveResourceLocation('pricing_rules', 'ruleId'),
 *       enforceLocationScope,
 *       controller.update,
 *     );
 *
 * On lookup failure or cross-tenant access, returns 404 (not 403) to avoid
 * leaking existence across tenants.
 *
 * @param table   - must be a key of `RESOURCE_TABLE_MAP` (validated at call time)
 * @param idParam - name of the route param containing the row id
 */
const resolveResourceLocation = (table, idParam) => {
    const entry = RESOURCE_TABLE_MAP[table];
    if (!entry) {
        // This runs at module load when routes register. Crash loudly so typos
        // are caught on deploy, not in production under load.
        throw new Error(`resolveResourceLocation: unknown table "${table}". Add it to RESOURCE_TABLE_MAP.`);
    }
    const { column, softDelete } = entry;
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        const resourceId = req.params[idParam];
        if (!resourceId || typeof resourceId !== 'string') {
            return res.status(400).json({ error: `${idParam} is required` });
        }
        try {
            let query = database_1.supabase.from(table).select(column).eq('id', resourceId);
            if (softDelete) {
                query = query.is('deleted_at', null);
            }
            const { data, error } = yield query.maybeSingle();
            if (error) {
                logger_1.logger.error({ err: error, table, resourceId }, 'resolveResourceLocation lookup failed');
                return res.status(500).json({ error: 'Failed to resolve resource' });
            }
            if (!data) {
                // Row doesn't exist OR is soft-deleted. Return 404 — same response
                // as cross-tenant denial so the two cases are indistinguishable.
                return res.status(404).json({ error: 'Resource not found' });
            }
            const locationId = data[column];
            if (typeof locationId !== 'string') {
                logger_1.logger.error({ table, resourceId, column }, 'Resource missing location column');
                return res.status(500).json({ error: 'Resource has no owning location' });
            }
            req.targetLocationId = locationId;
            next();
        }
        catch (err) {
            logger_1.logger.error({ err, table, resourceId }, 'resolveResourceLocation threw');
            return res.status(500).json({ error: 'Failed to resolve resource' });
        }
    });
};
exports.resolveResourceLocation = resolveResourceLocation;
/**
 * Pre-composed front-door middleware chain. Equivalent to
 * `[authenticateEmployee, enforceLocationScope]` — fail-closed by design.
 * For resource-param routes, insert `resolveResourceLocation(...)` between
 * the two so the resolver can populate `targetLocationId` before
 * enforcement runs.
 */
exports.requireEmployee = [exports.authenticateEmployee, exports.enforceLocationScope];
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
