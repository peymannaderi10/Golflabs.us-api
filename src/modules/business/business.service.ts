import crypto from 'crypto';
import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { isReservedSlug } from '../../shared/constants/reserved-slugs';
import { EmailService } from '../email/email.service';
import {
  StartSignupInput,
  StartSignupResult,
  VerifySignupInput,
  VerifySignupResult,
  AdditionalLocationInput,
} from './business.types';

const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;

export class BusinessSignupError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface CreateLocationResult {
  locationId: string;
}

interface PendingPayload {
  business: StartSignupInput['business'];
  owner: StartSignupInput['owner'];
  location: StartSignupInput['location'];
}

/**
 * Hash an email for logging so we never log raw PII. Uses SHA-256 truncated
 * to 12 hex chars — enough to correlate entries without being reversible at
 * scale.
 */
function hashEmailForLogs(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}

function hashOtp(otp: string, email: string): string {
  // Salt with the email so two users receiving the same OTP do not share a hash
  return crypto
    .createHash('sha256')
    .update(`${email.toLowerCase()}::${otp}`)
    .digest('hex');
}

function generateOtp(): string {
  // Cryptographically secure 6-digit code
  const buf = crypto.randomBytes(4).readUInt32BE(0);
  return (buf % 1_000_000).toString().padStart(6, '0');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function mapRpcError(error: { message?: string } | null | undefined): BusinessSignupError {
  const msg = error?.message ?? '';
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
  if (msg.includes('free_tier_location_limit_reached')) {
    return new BusinessSignupError(
      'Your free plan is limited to 1 location. Upgrade to add more.',
      402
    );
  }
  if (msg.includes('free_tier_space_limit_reached')) {
    return new BusinessSignupError(
      'Your free plan is limited to 4 spaces per location. Upgrade to add more.',
      402
    );
  }
  return new BusinessSignupError('Failed to create business', 500);
}

function renderOtpEmail(otp: string, businessName: string): { subject: string; html: string } {
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class BusinessService {
  /**
   * Step 1: Accept a signup payload, verify the email via OTP before any
   * durable DB writes. Stores the payload encrypted-at-rest (service-role
   * only) with a 15-minute TTL and emails a 6-digit code.
   */
  async startSignup(input: StartSignupInput): Promise<StartSignupResult> {
    // Opportunistic GC of expired pending rows so plaintext payloads do not
    // linger past their 15-minute TTL. Fire-and-forget; do not block on errors.
    void this.sweepExpiredPendingSignups();

    const { business, owner, location } = input;

    // Cheap in-memory checks first
    if (isReservedSlug(business.slug)) {
      throw new BusinessSignupError('This business URL is reserved', 409);
    }
    if (isReservedSlug(location.slug)) {
      throw new BusinessSignupError('This location URL is reserved', 409);
    }

    await this.preflightAvailability(business.slug, location.slug);

    // Check if the email already has an active auth user. We do NOT differentiate
    // the error from a generic failure to avoid account enumeration, but we DO
    // need to block the flow early so we don't overwrite an existing pending row.
    await this.assertEmailAvailable(owner.email);

    const otp = generateOtp();
    const otpHash = hashOtp(otp, owner.email);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const payload: PendingPayload = { business, owner, location };

    const { error: upsertErr } = await supabase
      .from('pending_business_signups')
      .upsert(
        {
          email: owner.email,
          payload,
          otp_hash: otpHash,
          attempt_count: 0,
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'email' }
      );

    if (upsertErr) {
      logger.error(
        { err: upsertErr, emailHash: hashEmailForLogs(owner.email) },
        'Failed to persist pending signup'
      );
      throw new BusinessSignupError('Failed to start signup', 500);
    }

    try {
      const { subject, html } = renderOtpEmail(otp, business.name);
      await EmailService.sendEmail(owner.email, subject, html);
    } catch (err) {
      logger.error(
        { err, emailHash: hashEmailForLogs(owner.email) },
        'Failed to send OTP email — rolling back pending row'
      );
      await supabase
        .from('pending_business_signups')
        .delete()
        .eq('email', owner.email);
      throw new BusinessSignupError('Failed to send verification email', 500);
    }

    return {
      email: owner.email,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Step 2: Validate the OTP and, if valid, create the Supabase auth user and
   * run the atomic DB transaction to provision the business. Consumes the
   * pending row on success or permanent failure.
   */
  async verifySignup(input: VerifySignupInput): Promise<VerifySignupResult> {
    const { email, otp } = input;
    const emailHash = hashEmailForLogs(email);

    const { data: pending, error: fetchErr } = await supabase
      .from('pending_business_signups')
      .select('email, payload, otp_hash, attempt_count, expires_at')
      .eq('email', email)
      .maybeSingle();

    if (fetchErr) {
      logger.error({ err: fetchErr, emailHash }, 'Failed to load pending signup');
      throw new BusinessSignupError('Verification failed', 500);
    }
    if (!pending) {
      throw new BusinessSignupError('Invalid or expired code', 400);
    }

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await supabase.from('pending_business_signups').delete().eq('email', email);
      throw new BusinessSignupError('Invalid or expired code', 400);
    }

    if (pending.attempt_count >= OTP_MAX_ATTEMPTS) {
      await supabase.from('pending_business_signups').delete().eq('email', email);
      throw new BusinessSignupError('Too many attempts. Please start over.', 429);
    }

    const expectedHash = hashOtp(otp, email);
    if (!timingSafeEqualHex(expectedHash, pending.otp_hash)) {
      await supabase
        .from('pending_business_signups')
        .update({ attempt_count: pending.attempt_count + 1 })
        .eq('email', email);
      throw new BusinessSignupError('Invalid or expired code', 400);
    }

    const payload = pending.payload as PendingPayload;

    // Re-run availability checks in case slugs were taken during the OTP window
    await this.preflightAvailability(payload.business.slug, payload.location.slug);

    // 1. Create auth user (now that email ownership is proven).
    //    If a previous signup attempt created an auth user but crashed before
    //    writing user_profiles, recover by deleting the orphan and retrying
    //    once. Any row in user_profiles means the email really is in use by
    //    an active account and we must not proceed.
    const userId = await this.createAuthUserWithOrphanRecovery(payload, emailHash);

    // 2. All DB writes inside a single transaction
    const { data, error: rpcErr } = await supabase.rpc('create_business_signup', {
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
      p_location_phone: payload.location.phone ?? '',
      p_location_timezone: payload.location.timezone ?? 'America/New_York',
      p_sales_tax_rate: payload.location.salesTaxRate ?? 0,
    });

    if (rpcErr || !data) {
      logger.error(
        { event: 'auth_orphan', err: rpcErr, userId, emailHash },
        'create_business_signup RPC failed — deleting auth user'
      );
      await this.deleteAuthUser(userId);
      throw mapRpcError(rpcErr);
    }

    const result = this.parseSignupResult(data);

    // Consume the pending row
    await supabase.from('pending_business_signups').delete().eq('email', email);

    return result;
  }

  /**
   * Creates an additional location under an existing client. Caller's
   * effective role is passed to the RPC so 'admin' callers do not auto-elevate
   * to 'owner' on the new location.
   */
  async createLocation(
    clientId: string,
    callerUserId: string,
    callerRole: 'owner' | 'admin',
    location: AdditionalLocationInput
  ): Promise<CreateLocationResult> {
    // No slug preflight: sibling locations share the parent client's
    // subdomain, and the create_client_location RPC auto-generates a unique
    // locations.slug from the name.
    const { data, error } = await supabase.rpc('create_client_location', {
      p_client_id: clientId,
      p_user_id: callerUserId,
      p_caller_role: callerRole,
      p_location_name: location.name,
      p_location_slug: '',
      p_location_address: location.address,
      p_location_city: location.city,
      p_location_state: location.state,
      p_location_zip: location.zipCode,
      p_location_phone: location.phone ?? '',
      p_location_timezone: location.timezone ?? 'America/New_York',
      p_sales_tax_rate: location.salesTaxRate ?? 0,
    });

    if (error || !data) {
      logger.error({ err: error, clientId }, 'create_client_location RPC failed');
      throw mapRpcError(error);
    }

    const locationId = typeof (data as { location_id?: unknown }).location_id === 'string'
      ? (data as { location_id: string }).location_id
      : null;

    if (!locationId) {
      logger.error({ data }, 'create_client_location RPC returned malformed result');
      throw new BusinessSignupError('Failed to create location', 500);
    }

    return { locationId };
  }

  private parseSignupResult(data: unknown): VerifySignupResult {
    if (!data || typeof data !== 'object') {
      throw new BusinessSignupError('Failed to create business', 500);
    }
    const obj = data as Record<string, unknown>;
    const clientId = typeof obj.client_id === 'string' ? obj.client_id : null;
    const locationId = typeof obj.location_id === 'string' ? obj.location_id : null;
    const userId = typeof obj.user_id === 'string' ? obj.user_id : null;
    if (!clientId || !locationId || !userId) {
      logger.error({ data }, 'create_business_signup RPC returned malformed result');
      throw new BusinessSignupError('Failed to create business', 500);
    }
    return { clientId, locationId, userId };
  }

  /**
   * Parallel availability checks. Throws generic errors to avoid enumeration.
   * Treats any Supabase query error as a 500 rather than silently proceeding.
   */
  private async preflightAvailability(
    businessSlug: string | undefined,
    locationSlug: string
  ): Promise<void> {
    const [locationSlugRes, customDomainRes, businessSlugRes] = await Promise.all([
      supabase.from('locations').select('id').eq('slug', locationSlug).maybeSingle(),
      supabase
        .from('location_settings')
        .select('location_id')
        .eq('custom_domain', locationSlug)
        .maybeSingle(),
      businessSlug
        ? supabase.from('clients').select('id').eq('slug', businessSlug).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (locationSlugRes.error || customDomainRes.error || businessSlugRes.error) {
      logger.error(
        {
          locErr: locationSlugRes.error,
          domErr: customDomainRes.error,
          bizErr: businessSlugRes.error,
        },
        'Preflight availability check failed'
      );
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
  }

  /**
   * Check whether an email is already registered without revealing the
   * answer in the HTTP response. Throws a generic error regardless of cause
   * when a collision is detected.
   */
  private async assertEmailAvailable(email: string): Promise<void> {
    // Supabase doesn't expose a direct "does this email exist" API on the
    // admin surface without pagination. Instead we probe user_profiles, which
    // mirrors every created account.
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .is('deleted_at', null)
      .maybeSingle();

    if (data) {
      // Generic error — same shape as any other "cannot start signup" failure
      throw new BusinessSignupError('Unable to start signup with these details', 409);
    }
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
  private async createAuthUserWithOrphanRecovery(
    payload: PendingPayload,
    emailHash: string
  ): Promise<string> {
    const createOnce = async () =>
      supabase.auth.admin.createUser({
        email: payload.owner.email,
        password: payload.owner.password,
        email_confirm: true, // proven via OTP
        user_metadata: { full_name: payload.owner.fullName },
      });

    const first = await createOnce();
    if (!first.error && first.data?.user) {
      return first.data.user.id;
    }

    const msg = first.error?.message?.toLowerCase() ?? '';
    const isAlreadyRegistered = msg.includes('already') || msg.includes('registered');

    if (!isAlreadyRegistered) {
      logger.error(
        { err: first.error, emailHash },
        'Failed to create auth user during signup verification'
      );
      throw new BusinessSignupError('Failed to create account', 500);
    }

    // Probe for an active profile — if present, the email really is in use.
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', payload.owner.email)
      .is('deleted_at', null)
      .maybeSingle();

    if (profile) {
      logger.warn(
        { emailHash, event: 'signup_collision' },
        'Active account already exists for email — refusing to overwrite'
      );
      throw new BusinessSignupError('Failed to create account', 500);
    }

    // Orphan confirmed: locate the auth user and delete it.
    logger.warn(
      { emailHash, event: 'orphan_recovery' },
      'Found orphaned auth user with no profile — deleting and retrying'
    );

    await this.deleteOrphanAuthUserByEmail(payload.owner.email, emailHash);

    const retry = await createOnce();
    if (retry.error || !retry.data?.user) {
      logger.error(
        { err: retry.error, emailHash, event: 'orphan_recovery_retry_failed' },
        'Orphan recovery retry failed'
      );
      throw new BusinessSignupError('Failed to create account', 500);
    }
    return retry.data.user.id;
  }

  /**
   * Locate an orphaned auth user by email (via the admin listUsers API) and
   * delete them. Paginates up to a small limit to avoid pathological scans.
   */
  private async deleteOrphanAuthUserByEmail(email: string, emailHash: string): Promise<void> {
    const target = email.toLowerCase();
    try {
      // listUsers paginates; search the first few pages for the matching email.
      for (let page = 1; page <= 5; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data) break;
        const match = data.users.find(
          (u) => (u.email ?? '').toLowerCase() === target
        );
        if (match) {
          await supabase.auth.admin.deleteUser(match.id);
          return;
        }
        if (data.users.length < 200) break;
      }
      logger.error(
        { emailHash, event: 'orphan_lookup_failed' },
        'Could not locate orphan auth user to delete'
      );
    } catch (err: unknown) {
      logger.error(
        { err, emailHash, event: 'orphan_delete_failed' },
        'Exception deleting orphan auth user'
      );
    }
  }

  /**
   * Delete any `pending_business_signups` rows whose TTL has elapsed. Runs
   * opportunistically at the start of `startSignup` so expired plaintext
   * payloads do not accumulate indefinitely in the absence of a pg_cron job.
   */
  private async sweepExpiredPendingSignups(): Promise<void> {
    try {
      await supabase
        .from('pending_business_signups')
        .delete()
        .lt('expires_at', new Date().toISOString());
    } catch (err: unknown) {
      // Non-fatal — GC is best-effort
      logger.warn({ err, event: 'pending_gc_failed' }, 'Failed to sweep expired pending signups');
    }
  }

  private async deleteAuthUser(userId: string): Promise<void> {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (err: unknown) {
      logger.error(
        { event: 'auth_orphan_cleanup_failed', err, userId },
        'Failed to delete auth user during signup rollback — manual cleanup required'
      );
    }
  }
}
