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
exports.BusinessService = exports.BusinessSignupError = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const reserved_slugs_1 = require("../../shared/constants/reserved-slugs");
const email_service_1 = require("../email/email.service");
const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
class BusinessSignupError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.BusinessSignupError = BusinessSignupError;
/**
 * Hash an email for logging so we never log raw PII. Uses SHA-256 truncated
 * to 12 hex chars — enough to correlate entries without being reversible at
 * scale.
 */
function hashEmailForLogs(email) {
    return crypto_1.default.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}
function hashOtp(otp, email) {
    // Salt with the email so two users receiving the same OTP do not share a hash
    return crypto_1.default
        .createHash('sha256')
        .update(`${email.toLowerCase()}::${otp}`)
        .digest('hex');
}
function generateOtp() {
    // Cryptographically secure 6-digit code
    const buf = crypto_1.default.randomBytes(4).readUInt32BE(0);
    return (buf % 1000000).toString().padStart(6, '0');
}
function timingSafeEqualHex(a, b) {
    if (a.length !== b.length)
        return false;
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    }
    catch (_a) {
        return false;
    }
}
function mapRpcError(error) {
    var _a;
    const msg = (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : '';
    if (msg.includes('business_slug_reserved') || msg.includes('location_slug_reserved')) {
        return new BusinessSignupError('This URL is reserved', 409);
    }
    if (msg.includes('business_slug_taken')) {
        return new BusinessSignupError('This business URL is already taken', 409);
    }
    if (msg.includes('location_slug_taken')) {
        return new BusinessSignupError('This location URL is already taken', 409);
    }
    if (msg.includes('custom_domain_taken')) {
        return new BusinessSignupError('This subdomain is already taken', 409);
    }
    if (msg.includes('client_not_found')) {
        return new BusinessSignupError('Business not found', 404);
    }
    if (msg.includes('forbidden_caller_role')) {
        return new BusinessSignupError('Insufficient permissions', 403);
    }
    return new BusinessSignupError('Failed to create business', 500);
}
function renderOtpEmail(otp, businessName) {
    const subject = `Your Golf Labs verification code: ${otp}`;
    const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0f172a;">Verify your email</h2>
      <p style="color: #475569;">
        Use the code below to finish creating <strong>${escapeHtml(businessName)}</strong> on Golf Labs.
      </p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; background: #f1f5f9; border-radius: 8px; text-align: center; margin: 24px 0; color: #0f172a;">
        ${otp}
      </div>
      <p style="color: #64748b; font-size: 14px;">
        This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.
      </p>
    </div>
  `;
    return { subject, html };
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
class BusinessService {
    /**
     * Step 1: Accept a signup payload, verify the email via OTP before any
     * durable DB writes. Stores the payload encrypted-at-rest (service-role
     * only) with a 15-minute TTL and emails a 6-digit code.
     */
    startSignup(input) {
        return __awaiter(this, void 0, void 0, function* () {
            // Opportunistic GC of expired pending rows so plaintext payloads do not
            // linger past their 15-minute TTL. Fire-and-forget; do not block on errors.
            void this.sweepExpiredPendingSignups();
            const { business, owner, location } = input;
            // Cheap in-memory checks first
            if ((0, reserved_slugs_1.isReservedSlug)(business.slug)) {
                throw new BusinessSignupError('This business URL is reserved', 409);
            }
            if ((0, reserved_slugs_1.isReservedSlug)(location.slug)) {
                throw new BusinessSignupError('This location URL is reserved', 409);
            }
            yield this.preflightAvailability(business.slug, location.slug);
            // Check if the email already has an active auth user. We do NOT differentiate
            // the error from a generic failure to avoid account enumeration, but we DO
            // need to block the flow early so we don't overwrite an existing pending row.
            yield this.assertEmailAvailable(owner.email);
            const otp = generateOtp();
            const otpHash = hashOtp(otp, owner.email);
            const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
            const payload = { business, owner, location };
            const { error: upsertErr } = yield database_1.supabase
                .from('pending_business_signups')
                .upsert({
                email: owner.email,
                payload,
                otp_hash: otpHash,
                attempt_count: 0,
                expires_at: expiresAt.toISOString(),
            }, { onConflict: 'email' });
            if (upsertErr) {
                logger_1.logger.error({ err: upsertErr, emailHash: hashEmailForLogs(owner.email) }, 'Failed to persist pending signup');
                throw new BusinessSignupError('Failed to start signup', 500);
            }
            try {
                const { subject, html } = renderOtpEmail(otp, business.name);
                yield email_service_1.EmailService.sendEmail(owner.email, subject, html);
            }
            catch (err) {
                logger_1.logger.error({ err, emailHash: hashEmailForLogs(owner.email) }, 'Failed to send OTP email — rolling back pending row');
                yield database_1.supabase
                    .from('pending_business_signups')
                    .delete()
                    .eq('email', owner.email);
                throw new BusinessSignupError('Failed to send verification email', 500);
            }
            return {
                email: owner.email,
                expiresAt: expiresAt.toISOString(),
            };
        });
    }
    /**
     * Step 2: Validate the OTP and, if valid, create the Supabase auth user and
     * run the atomic DB transaction to provision the business. Consumes the
     * pending row on success or permanent failure.
     */
    verifySignup(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const { email, otp } = input;
            const emailHash = hashEmailForLogs(email);
            const { data: pending, error: fetchErr } = yield database_1.supabase
                .from('pending_business_signups')
                .select('email, payload, otp_hash, attempt_count, expires_at')
                .eq('email', email)
                .maybeSingle();
            if (fetchErr) {
                logger_1.logger.error({ err: fetchErr, emailHash }, 'Failed to load pending signup');
                throw new BusinessSignupError('Verification failed', 500);
            }
            if (!pending) {
                throw new BusinessSignupError('Invalid or expired code', 400);
            }
            if (new Date(pending.expires_at).getTime() < Date.now()) {
                yield database_1.supabase.from('pending_business_signups').delete().eq('email', email);
                throw new BusinessSignupError('Invalid or expired code', 400);
            }
            if (pending.attempt_count >= OTP_MAX_ATTEMPTS) {
                yield database_1.supabase.from('pending_business_signups').delete().eq('email', email);
                throw new BusinessSignupError('Too many attempts. Please start over.', 429);
            }
            const expectedHash = hashOtp(otp, email);
            if (!timingSafeEqualHex(expectedHash, pending.otp_hash)) {
                yield database_1.supabase
                    .from('pending_business_signups')
                    .update({ attempt_count: pending.attempt_count + 1 })
                    .eq('email', email);
                throw new BusinessSignupError('Invalid or expired code', 400);
            }
            const payload = pending.payload;
            // Re-run availability checks in case slugs were taken during the OTP window
            yield this.preflightAvailability(payload.business.slug, payload.location.slug);
            // 1. Create auth user (now that email ownership is proven).
            //    If a previous signup attempt created an auth user but crashed before
            //    writing user_profiles, recover by deleting the orphan and retrying
            //    once. Any row in user_profiles means the email really is in use by
            //    an active account and we must not proceed.
            const userId = yield this.createAuthUserWithOrphanRecovery(payload, emailHash);
            // 2. All DB writes inside a single transaction
            const { data, error: rpcErr } = yield database_1.supabase.rpc('create_business_signup', {
                p_user_id: userId,
                p_user_email: payload.owner.email,
                p_user_full_name: payload.owner.fullName,
                p_business_name: payload.business.name,
                p_business_slug: payload.business.slug,
                p_location_name: payload.location.name,
                p_location_slug: payload.location.slug,
                p_location_address: payload.location.address,
                p_location_city: payload.location.city,
                p_location_state: payload.location.state,
                p_location_zip: payload.location.zipCode,
                p_location_phone: (_a = payload.location.phone) !== null && _a !== void 0 ? _a : '',
                p_location_timezone: (_b = payload.location.timezone) !== null && _b !== void 0 ? _b : 'America/New_York',
                p_sales_tax_rate: (_c = payload.location.salesTaxRate) !== null && _c !== void 0 ? _c : 0,
            });
            if (rpcErr || !data) {
                logger_1.logger.error({ event: 'auth_orphan', err: rpcErr, userId, emailHash }, 'create_business_signup RPC failed — deleting auth user');
                yield this.deleteAuthUser(userId);
                throw mapRpcError(rpcErr);
            }
            const result = this.parseSignupResult(data);
            // Consume the pending row
            yield database_1.supabase.from('pending_business_signups').delete().eq('email', email);
            return result;
        });
    }
    /**
     * Creates an additional location under an existing client. Caller's
     * effective role is passed to the RPC so 'admin' callers do not auto-elevate
     * to 'owner' on the new location.
     */
    createLocation(clientId, callerUserId, callerRole, location) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if ((0, reserved_slugs_1.isReservedSlug)(location.slug)) {
                throw new BusinessSignupError('This URL is reserved', 409);
            }
            yield this.preflightAvailability(undefined, location.slug);
            const { data, error } = yield database_1.supabase.rpc('create_client_location', {
                p_client_id: clientId,
                p_user_id: callerUserId,
                p_caller_role: callerRole,
                p_location_name: location.name,
                p_location_slug: location.slug,
                p_location_address: location.address,
                p_location_city: location.city,
                p_location_state: location.state,
                p_location_zip: location.zipCode,
                p_location_phone: (_a = location.phone) !== null && _a !== void 0 ? _a : '',
                p_location_timezone: (_b = location.timezone) !== null && _b !== void 0 ? _b : 'America/New_York',
                p_sales_tax_rate: (_c = location.salesTaxRate) !== null && _c !== void 0 ? _c : 0,
            });
            if (error || !data) {
                logger_1.logger.error({ err: error, clientId }, 'create_client_location RPC failed');
                throw mapRpcError(error);
            }
            const locationId = typeof data.location_id === 'string'
                ? data.location_id
                : null;
            if (!locationId) {
                logger_1.logger.error({ data }, 'create_client_location RPC returned malformed result');
                throw new BusinessSignupError('Failed to create location', 500);
            }
            return { locationId };
        });
    }
    parseSignupResult(data) {
        if (!data || typeof data !== 'object') {
            throw new BusinessSignupError('Failed to create business', 500);
        }
        const obj = data;
        const clientId = typeof obj.client_id === 'string' ? obj.client_id : null;
        const locationId = typeof obj.location_id === 'string' ? obj.location_id : null;
        const userId = typeof obj.user_id === 'string' ? obj.user_id : null;
        if (!clientId || !locationId || !userId) {
            logger_1.logger.error({ data }, 'create_business_signup RPC returned malformed result');
            throw new BusinessSignupError('Failed to create business', 500);
        }
        return { clientId, locationId, userId };
    }
    /**
     * Parallel availability checks. Throws generic errors to avoid enumeration.
     * Treats any Supabase query error as a 500 rather than silently proceeding.
     */
    preflightAvailability(businessSlug, locationSlug) {
        return __awaiter(this, void 0, void 0, function* () {
            const [locationSlugRes, customDomainRes, businessSlugRes] = yield Promise.all([
                database_1.supabase.from('locations').select('id').eq('slug', locationSlug).maybeSingle(),
                database_1.supabase
                    .from('location_settings')
                    .select('location_id')
                    .eq('custom_domain', locationSlug)
                    .maybeSingle(),
                businessSlug
                    ? database_1.supabase.from('clients').select('id').eq('slug', businessSlug).maybeSingle()
                    : Promise.resolve({ data: null, error: null }),
            ]);
            if (locationSlugRes.error || customDomainRes.error || businessSlugRes.error) {
                logger_1.logger.error({
                    locErr: locationSlugRes.error,
                    domErr: customDomainRes.error,
                    bizErr: businessSlugRes.error,
                }, 'Preflight availability check failed');
                throw new BusinessSignupError('Service temporarily unavailable', 503);
            }
            if (locationSlugRes.data) {
                throw new BusinessSignupError('This location URL is already taken', 409);
            }
            if (customDomainRes.data) {
                throw new BusinessSignupError('This subdomain is already taken', 409);
            }
            if (businessSlugRes.data) {
                throw new BusinessSignupError('This business URL is already taken', 409);
            }
        });
    }
    /**
     * Check whether an email is already registered without revealing the
     * answer in the HTTP response. Throws a generic error regardless of cause
     * when a collision is detected.
     */
    assertEmailAvailable(email) {
        return __awaiter(this, void 0, void 0, function* () {
            // Supabase doesn't expose a direct "does this email exist" API on the
            // admin surface without pagination. Instead we probe user_profiles, which
            // mirrors every created account.
            const { data } = yield database_1.supabase
                .from('user_profiles')
                .select('id')
                .eq('email', email)
                .is('deleted_at', null)
                .maybeSingle();
            if (data) {
                // Generic error — same shape as any other "cannot start signup" failure
                throw new BusinessSignupError('Unable to start signup with these details', 409);
            }
        });
    }
    /**
     * Create the Supabase auth user, with a single orphan-recovery retry.
     *
     * A previous signup attempt may have created an auth user then failed
     * before writing `user_profiles`. That leaves a zombie auth user that
     * blocks any future signup with the same email. If we detect this case
     * (createUser fails with "already registered" AND no active user_profiles
     * row exists), we delete the orphan and retry once.
     */
    createAuthUserWithOrphanRecovery(payload, emailHash) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const createOnce = () => __awaiter(this, void 0, void 0, function* () {
                return database_1.supabase.auth.admin.createUser({
                    email: payload.owner.email,
                    password: payload.owner.password,
                    email_confirm: true, // proven via OTP
                    user_metadata: { full_name: payload.owner.fullName },
                });
            });
            const first = yield createOnce();
            if (!first.error && ((_a = first.data) === null || _a === void 0 ? void 0 : _a.user)) {
                return first.data.user.id;
            }
            const msg = (_d = (_c = (_b = first.error) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.toLowerCase()) !== null && _d !== void 0 ? _d : '';
            const isAlreadyRegistered = msg.includes('already') || msg.includes('registered');
            if (!isAlreadyRegistered) {
                logger_1.logger.error({ err: first.error, emailHash }, 'Failed to create auth user during signup verification');
                throw new BusinessSignupError('Failed to create account', 500);
            }
            // Probe for an active profile — if present, the email really is in use.
            const { data: profile } = yield database_1.supabase
                .from('user_profiles')
                .select('id')
                .eq('email', payload.owner.email)
                .is('deleted_at', null)
                .maybeSingle();
            if (profile) {
                logger_1.logger.warn({ emailHash, event: 'signup_collision' }, 'Active account already exists for email — refusing to overwrite');
                throw new BusinessSignupError('Failed to create account', 500);
            }
            // Orphan confirmed: locate the auth user and delete it.
            logger_1.logger.warn({ emailHash, event: 'orphan_recovery' }, 'Found orphaned auth user with no profile — deleting and retrying');
            yield this.deleteOrphanAuthUserByEmail(payload.owner.email, emailHash);
            const retry = yield createOnce();
            if (retry.error || !((_e = retry.data) === null || _e === void 0 ? void 0 : _e.user)) {
                logger_1.logger.error({ err: retry.error, emailHash, event: 'orphan_recovery_retry_failed' }, 'Orphan recovery retry failed');
                throw new BusinessSignupError('Failed to create account', 500);
            }
            return retry.data.user.id;
        });
    }
    /**
     * Locate an orphaned auth user by email (via the admin listUsers API) and
     * delete them. Paginates up to a small limit to avoid pathological scans.
     */
    deleteOrphanAuthUserByEmail(email, emailHash) {
        return __awaiter(this, void 0, void 0, function* () {
            const target = email.toLowerCase();
            try {
                // listUsers paginates; search the first few pages for the matching email.
                for (let page = 1; page <= 5; page += 1) {
                    const { data, error } = yield database_1.supabase.auth.admin.listUsers({ page, perPage: 200 });
                    if (error || !data)
                        break;
                    const match = data.users.find((u) => { var _a; return ((_a = u.email) !== null && _a !== void 0 ? _a : '').toLowerCase() === target; });
                    if (match) {
                        yield database_1.supabase.auth.admin.deleteUser(match.id);
                        return;
                    }
                    if (data.users.length < 200)
                        break;
                }
                logger_1.logger.error({ emailHash, event: 'orphan_lookup_failed' }, 'Could not locate orphan auth user to delete');
            }
            catch (err) {
                logger_1.logger.error({ err, emailHash, event: 'orphan_delete_failed' }, 'Exception deleting orphan auth user');
            }
        });
    }
    /**
     * Delete any `pending_business_signups` rows whose TTL has elapsed. Runs
     * opportunistically at the start of `startSignup` so expired plaintext
     * payloads do not accumulate indefinitely in the absence of a pg_cron job.
     */
    sweepExpiredPendingSignups() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield database_1.supabase
                    .from('pending_business_signups')
                    .delete()
                    .lt('expires_at', new Date().toISOString());
            }
            catch (err) {
                // Non-fatal — GC is best-effort
                logger_1.logger.warn({ err, event: 'pending_gc_failed' }, 'Failed to sweep expired pending signups');
            }
        });
    }
    deleteAuthUser(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield database_1.supabase.auth.admin.deleteUser(userId);
            }
            catch (err) {
                logger_1.logger.error({ event: 'auth_orphan_cleanup_failed', err, userId }, 'Failed to delete auth user during signup rollback — manual cleanup required');
            }
        });
    }
}
exports.BusinessService = BusinessService;
