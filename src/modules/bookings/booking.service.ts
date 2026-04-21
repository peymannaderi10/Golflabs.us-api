import { randomUUID } from 'crypto';
import { supabase } from '../../config/database';
import { parseTimeString, createISOTimestamp } from '../../shared/utils/date.utils';
import { BookingDetails } from './booking.types';
import { promotionService } from '../promotions/promotion.service';
import { CapacityHoldService } from './capacity-hold.service';
import { MembershipService } from '../memberships/membership.service';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/utils/error.utils';
import { stripe, getStripeOptions } from '../../config/stripe';
import Stripe from 'stripe';
import { PaymentService } from '../payments/payment.service';

// Sub-service imports (facade delegates)
import { BookingCancelService } from './booking-cancel.service';
import { BookingEmployeeService } from './booking-employee.service';
import { BookingExtensionService } from './booking-extension.service';
import { SpaceService } from '../spaces/space.service';

export class BookingService {
  private capacityHoldService = new CapacityHoldService();
  private membershipService = new MembershipService();
  private cancelService = new BookingCancelService();
  private employeeService = new BookingEmployeeService();
  private extensionService = new BookingExtensionService();

  // =====================================================
  // CORE BOOKING QUERIES
  // =====================================================

  async getBookingLocationId(bookingId: string): Promise<string | null> {
    const { data } = await supabase
      .from('bookings')
      .select('location_id')
      .eq('id', bookingId)
      .single();
    return data?.location_id ?? null;
  }

  async getBookingUserId(bookingId: string): Promise<string | null> {
    const { data } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('id', bookingId)
      .single();
    return data?.user_id ?? null;
  }

  async reserveBooking(bookingData: BookingDetails) {
    const {
      locationId,
      userId,
      spaceId,
      date,
      startTime,
      endTime,
      partySize,
      totalAmount
    } = bookingData;

    // Basic validation
    if (!locationId || !userId || !spaceId || !date || !startTime || !endTime || !partySize || totalAmount == null) {
      throw new Error('Missing required booking details');
    }

    // First, get the location's timezone
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    if (locationError || !location) {
      logger.error({ err: locationError }, 'Error fetching location timezone');
      throw new Error('Invalid location ID');
    }

    const timezone = location.timezone || 'America/New_York';

    // Validate that start and end times are on the same day
    const startTimeParsed = parseTimeString(startTime);
    const endTimeParsed = parseTimeString(endTime);

    // If end time is earlier than start time, it suggests an overnight booking
    if (endTimeParsed.hours < startTimeParsed.hours ||
        (endTimeParsed.hours === startTimeParsed.hours && endTimeParsed.minutes < startTimeParsed.minutes)) {
      throw new Error('Overnight bookings are not allowed. Please book within a single day (12am to 11:59pm).');
    }

    const p_start_time = createISOTimestamp(date, startTime, timezone);
    const p_end_time = createISOTimestamp(date, endTime, timezone);

    logger.info({ timezone, date, startTime, endTime, p_start_time, p_end_time }, 'Creating booking');

    // Fetch location settings (needed for booking rules + reservation timeout)
    const locationSettings = await this.membershipService.getLocationMembershipSettings(locationId);

    // Members-only gate: reject if location requires membership and user doesn't have one
    const membersOnlyGateResult = locationSettings.bookingFlowMode === 'members_only'
      ? await this.membershipService.getActiveMembershipForUser(userId, locationId)
      : undefined; // undefined = gate not applicable

    if (locationSettings.bookingFlowMode === 'members_only' && !membersOnlyGateResult) {
      throw new AppError('This location requires an active membership to book.', 403);
    }

    // Enforce booking window and available hours based on membership
    try {

      // Only look up membership benefits if memberships are enabled at this location
      // Reuse gate result when available to avoid a second DB query
      const membership = locationSettings.membershipsEnabled
        ? (membersOnlyGateResult ?? await this.membershipService.getActiveMembershipForUser(userId, locationId))
        : null;
      const benefits = membership?.benefits;

      // Booking window enforcement: how far in advance can this user book?
      const bookingWindowDays = benefits?.bookingWindowDays ?? locationSettings.defaultBookingWindowDays;
      const bookingStartDate = new Date(p_start_time);
      const maxBookableDate = new Date();
      maxBookableDate.setDate(maxBookableDate.getDate() + bookingWindowDays);

      if (bookingStartDate > maxBookableDate) {
        const windowLabel = membership ? `${bookingWindowDays} days (member)` : `${bookingWindowDays} days`;
        throw new Error(`Bookings can only be made up to ${windowLabel} in advance.`);
      }

      // Available hours enforcement: members with extended hours bypass, everyone else uses location defaults
      if (locationSettings.defaultBookingHours && !membership) {
        const { start: allowedStart, end: allowedEnd } = locationSettings.defaultBookingHours;
        const [allowedStartH] = allowedStart.split(':').map(Number);
        const [allowedEndH] = allowedEnd.split(':').map(Number);

        const bookingLocalHour = parseInt(
          bookingStartDate.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone })
        );

        const isOutsideHours = allowedEndH > allowedStartH
          ? (bookingLocalHour < allowedStartH || bookingLocalHour >= allowedEndH)
          : (bookingLocalHour < allowedStartH && bookingLocalHour >= allowedEndH);

        if (isOutsideHours) {
          throw new Error(`Bookings are only available between ${allowedStart} and ${allowedEnd}.`);
        }
      }
    } catch (membershipErr: any) {
      if (membershipErr.message?.includes('Bookings can only') || membershipErr.message?.includes('Non-member bookings')) {
        throw membershipErr;
      }
      logger.error({ err: membershipErr }, 'Error checking membership for booking rules');
      // Non-fatal for other errors: allow the booking to proceed
    }

    // Check capacity holds before proceeding
    // Convert 12h time (e.g. "6:00 PM") to 24h (e.g. "18:00") for hold comparison
    const start24 = `${String(startTimeParsed.hours).padStart(2, '0')}:${String(startTimeParsed.minutes).padStart(2, '0')}`;
    const end24 = `${String(endTimeParsed.hours).padStart(2, '0')}:${String(endTimeParsed.minutes).padStart(2, '0')}`;

    // Get total spaces at this location for capacity calculations
    const { data: spacesData } = await supabase
      .from('spaces')
      .select('id')
      .eq('location_id', locationId)
      .neq('status', 'closed');
    const totalSpaces = spacesData?.length || 0;

    // Count existing non-league bookings in this window for capacity hold enforcement
    const { count: existingBookingsInWindow } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .in('status', ['confirmed', 'reserved'])
      .lt('start_time', p_end_time)
      .gt('end_time', p_start_time);

    const holdConflict = await this.capacityHoldService.checkHoldConflict(
      locationId, date, start24, end24, totalSpaces, existingBookingsInWindow ?? 0
    );
    if (holdConflict) {
      const leagueName = holdConflict.league_name || 'League Night';
      throw new Error(`This time is reserved for ${leagueName}. Please choose a different time.`);
    }

    // Check space closures
    const spaceService = new SpaceService();
    const isClosed = await spaceService.getActiveClosuresForSlot(spaceId, date, start24, end24);
    if (isClosed) {
      throw new Error('This space is closed during the selected time. Please choose a different space or time.');
    }

    // Check if reservation holds are enabled for this location
    const reservationTimeoutMinutes = locationSettings.reservationTimeoutMinutes;
    const reservationsEnabled = reservationTimeoutMinutes !== null && reservationTimeoutMinutes > 0;

    // Generate a temporary payment intent ID for the reservation
    const tempPaymentIntentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Call the PostgreSQL function to create booking and all related records
    const { data, error } = await supabase.rpc('create_booking_and_payment_record', {
      p_location_id: locationId,
      p_user_id: userId,
      p_space_id: spaceId,
      p_start_time: p_start_time,
      p_end_time: p_end_time,
      p_party_size: partySize,
      p_total_amount: totalAmount,
      p_payment_intent_id: tempPaymentIntentId,
      p_user_agent: 'API',
      p_ip_address: '0.0.0.0',
      p_reservation_timeout_minutes: reservationsEnabled ? reservationTimeoutMinutes : null,
    });

    if (error) {
      logger.error({ err: error }, 'Error calling create_booking_and_payment_record function');
      if (error.message?.includes('duplicate key') || error.message?.includes('already exists') || error.message?.includes('Time slot is already booked')) {
        throw new Error('This time slot is no longer available.');
      }
      throw error;
    }

    // Function returns JSONB with { booking_id, expires_at }
    if (!data?.booking_id) {
      throw new Error('Failed to create booking - no booking ID returned');
    }

    // Use the authoritative expires_at from the DB (avoids clock skew with client-side computation)
    const expiresAt = data.expires_at ?? null;

    logger.info({ bookingId: data.booking_id, spaceId, p_start_time, p_end_time, reservationsEnabled, expiresAt }, 'Created new booking');

    // Auto-associate user with this location (idempotent upsert)
    await supabase
      .from('user_locations')
      .upsert({ user_id: userId, location_id: locationId }, { onConflict: 'user_id,location_id' })
      .then(({ error: ulErr }) => {
        if (ulErr) logger.warn({ err: ulErr, userId, locationId }, 'Failed to upsert user_locations (non-critical)');
      });

    return {
      bookingId: data.booking_id,
      expiresAt,
      reservationTimeoutMinutes: reservationsEnabled ? reservationTimeoutMinutes : null,
    };
  }

  /**
   * Hold the slot for a guest the moment they land on /guest-checkout
   * (only when guest_reservation_hold_enabled). Creates a `reserved`
   * booking row with a placeholder guest_email — updated with the real
   * email in createGuestCheckoutSession when the user submits the form.
   * Returns null fields when the hold is disabled so the frontend can
   * noop without a separate settings fetch.
   */
  async createGuestReservationHold(params: {
    locationId: string;
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    partySize: number;
  }): Promise<{ bookingId: string | null; expiresAt: string | null; reservationTimeoutMinutes: number | null }> {
    const { locationId, spaceId, date, startTime, endTime, partySize } = params;

    if (!locationId || !spaceId || !date || !startTime || !endTime) {
      throw new AppError('Missing required booking details', 400);
    }

    const locationSettings = await this.membershipService.getLocationMembershipSettings(locationId);
    if (locationSettings.bookingFlowMode !== 'guest_checkout') {
      throw new AppError('Guest checkout is not enabled for this location', 403);
    }

    const reservationTimeoutMinutes = locationSettings.reservationTimeoutMinutes;
    const holdEnabled = reservationTimeoutMinutes !== null && reservationTimeoutMinutes > 0 && locationSettings.guestReservationHoldEnabled === true;
    if (!holdEnabled) {
      return { bookingId: null, expiresAt: null, reservationTimeoutMinutes: null };
    }

    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();
    if (locationError || !location) throw new AppError('Invalid location ID', 400);

    const timezone = location.timezone || 'America/New_York';
    const p_start_time = createISOTimestamp(date, startTime, timezone);
    const p_end_time = createISOTimestamp(date, endTime, timezone);

    const expiresAt = new Date(Date.now() + reservationTimeoutMinutes * 60 * 1000).toISOString();
    // Placeholder email satisfies the bookings identity trigger
    // (user_id OR guest_email required). Overwritten with the real
    // email when the user submits the form.
    const placeholderEmail = `pending-${randomUUID()}@guest.golflabs.internal`;

    const { data: reserved, error: reserveError } = await supabase
      .from('bookings')
      .insert({
        location_id: locationId,
        user_id: null,
        space_id: spaceId,
        start_time: p_start_time,
        end_time: p_end_time,
        party_size: partySize,
        total_amount: 0,
        status: 'reserved',
        expires_at: expiresAt,
        guest_email: placeholderEmail,
        notes: 'Guest reservation hold',
      })
      .select('id')
      .single();

    if (reserveError || !reserved) {
      if (reserveError?.code === '23P01') {
        throw new AppError('Slot no longer available.', 409);
      }
      logger.error({ err: reserveError }, 'Failed to create guest reservation hold');
      throw new AppError('Failed to reserve slot. Please try again.', 500);
    }

    logger.info({ bookingId: reserved.id, locationId, spaceId, p_start_time }, 'Guest reservation hold created');
    return { bookingId: reserved.id, expiresAt, reservationTimeoutMinutes };
  }

  /**
   * Cancel a guest reservation hold (e.g., user clicks Back). Best-effort
   * — if this fails, the expired-reservations cron will sweep it.
   */
  async cancelGuestReservationHold(bookingId: string): Promise<void> {
    await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId)
      .eq('status', 'reserved')
      .is('user_id', null)
      .like('guest_email', 'pending-%@guest.golflabs.internal');
  }

  /**
   * Finalize the guest checkout: attach real guest info to an existing
   * reservation hold (or create one inline if the hold endpoint wasn't
   * used) and return a Stripe PaymentIntent client secret. In no-hold
   * mode no booking row is created here — the row is materialized at
   * capture time in handleAmountCapturableUpdated.
   */
  async createGuestCheckoutSession(params: {
    locationId: string;
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    partySize: number;
    guestEmail: string;
    guestName: string;
    guestPhone: string;
    documentHashes: Record<string, string>;
    existingBookingId?: string | null;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ clientSecret: string; stripeAccountId: string | null; amount: number; expiresAt: string | null; reservationTimeoutMinutes: number | null }> {
    const { locationId, spaceId, date, startTime, endTime, partySize, guestEmail, guestName, guestPhone, documentHashes, existingBookingId, ipAddress, userAgent } = params;

    if (!locationId || !spaceId || !date || !startTime || !endTime || !guestEmail) {
      throw new AppError('Missing required booking details', 400);
    }

    // Verify guest_checkout mode is enabled for this location
    const locationSettings = await this.membershipService.getLocationMembershipSettings(locationId);
    if (locationSettings.bookingFlowMode !== 'guest_checkout') {
      throw new AppError('Guest checkout is not enabled for this location', 403);
    }

    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();
    if (locationError || !location) throw new AppError('Invalid location ID', 400);

    const timezone = location.timezone || 'America/New_York';
    const startTimeParsed = parseTimeString(startTime);
    const endTimeParsed = parseTimeString(endTime);

    if (endTimeParsed.hours < startTimeParsed.hours ||
        (endTimeParsed.hours === startTimeParsed.hours && endTimeParsed.minutes < startTimeParsed.minutes)) {
      throw new AppError('Overnight bookings are not allowed.', 400);
    }

    const p_start_time = createISOTimestamp(date, startTime, timezone);
    const p_end_time = createISOTimestamp(date, endTime, timezone);

    // Availability / capacity / closure checks. Skipped when
    // existingBookingId is present — createGuestReservationHold already
    // ran them against a clean state; re-running here would pick up the
    // user's own reservation as a "conflict".
    if (!existingBookingId) {
      const { data: conflicts } = await supabase
        .from('bookings')
        .select('id, status, expires_at')
        .eq('space_id', spaceId)
        .in('status', ['confirmed', 'reserved'])
        .lt('start_time', p_end_time)
        .gt('end_time', p_start_time);
      const activeConflicts = (conflicts || []).filter(c => {
        if (c.status === 'reserved' && c.expires_at && new Date(c.expires_at) < new Date()) return false;
        return true;
      });
      if (activeConflicts.length > 0) {
        throw new AppError('Slot no longer available.', 409);
      }

      const start24 = `${String(startTimeParsed.hours).padStart(2, '0')}:${String(startTimeParsed.minutes).padStart(2, '0')}`;
      const end24 = `${String(endTimeParsed.hours).padStart(2, '0')}:${String(endTimeParsed.minutes).padStart(2, '0')}`;

      const { data: spacesData } = await supabase
        .from('spaces')
        .select('id')
        .eq('location_id', locationId)
        .neq('status', 'closed');
      const totalSpaces = spacesData?.length || 0;

      const { count: existingBookingsInWindow } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('status', ['confirmed', 'reserved'])
        .lt('start_time', p_end_time)
        .gt('end_time', p_start_time);

      const holdConflict = await this.capacityHoldService.checkHoldConflict(
        locationId, date, start24, end24, totalSpaces, existingBookingsInWindow ?? 0,
      );
      if (holdConflict) {
        const leagueName = holdConflict.league_name || 'League Night';
        throw new AppError(`This time is reserved for ${leagueName}. Please choose a different time.`, 409);
      }

      const spaceService = new SpaceService();
      const isClosed = await spaceService.getActiveClosuresForSlot(spaceId, date, start24, end24);
      if (isClosed) {
        throw new AppError('This space is closed during the selected time. Please choose a different space or time.', 409);
      }
    }

    // Server-computed price (never trust client totalAmount for guests)
    const paymentService = new PaymentService();
    const priceResult = await paymentService.calculatePrice(locationId, p_start_time, p_end_time, undefined);
    const amountCents = priceResult.total;
    if (amountCents === 0) {
      throw new AppError('Free bookings require an account. Please sign up to continue.', 400);
    }

    // Two modes, controlled by per-location toggle:
    //
    // 1) Reservation-hold mode (guestReservationHoldEnabled=true AND
    //    reservationTimeoutMinutes>0): pre-create a `reserved` booking row
    //    before the PI. The exclusion constraint (migration 073) serializes
    //    concurrent requests — second guest hits 23P01 and we return 409
    //    before they ever see the card form. Has the same timer-expires-your-
    //    cart UX as the authenticated flow.
    //
    // 2) No-hold mode (default for guest checkout): skip the upfront
    //    reservation. The PI is created without a booking row and the row
    //    is materialized in handleGuestPaymentSucceeded. If two guests
    //    capture before either insert lands, the exclusion constraint
    //    rejects the loser's INSERT and the loser's PI is auto-refunded.
    //    Chosen as default because guests have no visible timer UI —
    //    silently holding the slot for N minutes kicks slow typists out.
    const reservationTimeoutMinutes = locationSettings.reservationTimeoutMinutes;
    const useReservationHold = reservationTimeoutMinutes !== null && reservationTimeoutMinutes > 0 && locationSettings.guestReservationHoldEnabled === true;

    const normalizedGuestEmail = guestEmail.toLowerCase().trim();

    let bookingId: string | null = null;
    let expiresAt: string | null = null;
    if (useReservationHold) {
      if (existingBookingId) {
        // The slot was already reserved at page-load via
        // createGuestReservationHold. Update the row with the real guest
        // info + price, re-read expires_at for the timer.
        const { data: existing, error: updateError } = await supabase
          .from('bookings')
          .update({
            guest_email: normalizedGuestEmail,
            guest_name: guestName || null,
            guest_phone: guestPhone || null,
            total_amount: amountCents / 100,
            notes: 'Guest reservation',
          })
          .eq('id', existingBookingId)
          .eq('status', 'reserved')
          .select('id, expires_at')
          .single();

        if (updateError || !existing) {
          // Hold was swept (expired) or cancelled. Force the client to
          // start fresh from /book.
          logger.warn({ existingBookingId, err: updateError }, 'Existing guest reservation not updatable — expired?');
          throw new AppError('Your reservation expired. Please return to booking.', 410);
        }
        bookingId = existing.id;
        expiresAt = existing.expires_at;
      } else {
        // Fallback: no prior hold (e.g. hold feature toggled on after
        // page load). Reserve now.
        expiresAt = new Date(Date.now() + reservationTimeoutMinutes * 60 * 1000).toISOString();
        const { data: reservedBooking, error: reserveError } = await supabase
          .from('bookings')
          .insert({
            location_id: locationId,
            user_id: null,
            space_id: spaceId,
            start_time: p_start_time,
            end_time: p_end_time,
            party_size: partySize,
            total_amount: amountCents / 100,
            status: 'reserved',
            expires_at: expiresAt,
            guest_email: normalizedGuestEmail,
            guest_name: guestName || null,
            guest_phone: guestPhone || null,
            notes: 'Guest reservation',
          })
          .select('id')
          .single();

        if (reserveError || !reservedBooking) {
          if (reserveError?.code === '23P01') {
            throw new AppError('Slot no longer available.', 409);
          }
          logger.error({ err: reserveError }, 'Failed to create guest reservation');
          throw new AppError('Failed to reserve slot. Please try again.', 500);
        }
        bookingId = reservedBooking.id;
      }
    }

    const stripeOpts = await getStripeOptions(locationId);

    // Ephemeral Stripe customer for the guest — always create a fresh one
    // per booking session. We do NOT reuse by email lookup: on the platform
    // account (stripeOpts undefined) a global search could pull in a
    // customer from an unrelated tenant. On Connect accounts the lookup
    // is account-scoped and safe, but creating fresh per session is
    // consistent and predictable. Stripe imposes no cost on extra customers.
    let stripeCustomerId: string | null = null;
    try {
      const customer = await stripe.customers.create({
        email: guestEmail,
        name: guestName || undefined,
        phone: guestPhone || undefined,
        metadata: { guest: 'true', guest_location_id: locationId },
      }, stripeOpts);
      stripeCustomerId = customer.id;
    } catch (err) {
      logger.error({ err }, 'Error creating guest Stripe customer');
    }

    // Metadata carries booking_id (when a reservation was created) so the
    // capture webhook uses the standard bookingId branch. Without a
    // reservation, booking_id is omitted and the capture handler falls
    // back to the no-booking conflict check.
    const metadata: Record<string, string> = {
      is_guest: 'true',
      guest_email: normalizedGuestEmail,
      guest_name: guestName || '',
      guest_phone: guestPhone || '',
      location_id: locationId,
      space_id: spaceId,
      start_time: p_start_time,
      end_time: p_end_time,
      party_size: String(partySize),
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
      doc_hash_terms_of_service: documentHashes.terms_of_service || '',
      doc_hash_privacy_policy: documentHashes.privacy_policy || '',
      doc_hash_liability_waiver: documentHashes.liability_waiver || '',
      doc_hash_damage_fees_acknowledgment: documentHashes.damage_fees_acknowledgment || '',
    };
    if (bookingId) metadata.booking_id = bookingId;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency: 'usd',
      // Manual capture: authorize only. Webhook does a final slot-availability
      // check and captures (or cancels if slot was taken). Prevents the
      // charge-then-refund UX when slot is claimed during the payment window.
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      metadata,
    };
    if (stripeCustomerId) paymentIntentParams.customer = stripeCustomerId;

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, stripeOpts);
    } catch (err) {
      // Rollback the reservation (if any) so the slot is released
      // immediately. Without this, a Stripe outage would leave an orphan
      // reservation blocking the slot until the expired-reservations cron.
      if (bookingId) {
        await supabase.from('bookings').delete().eq('id', bookingId);
        logger.error({ err, bookingId }, 'Stripe PI creation failed; reservation rolled back');
      } else {
        logger.error({ err }, 'Stripe PI creation failed for guest checkout');
      }
      throw new AppError('Payment system unavailable. Please try again.', 502);
    }

    // Attach the real PI id to the reservation so the webhook can look
    // it up by payment_intent_id. Skipped in no-hold mode (no row yet).
    if (bookingId) {
      await supabase
        .from('bookings')
        .update({ payment_intent_id: paymentIntent.id })
        .eq('id', bookingId);
    }

    // Funnel tracking: one row per guest form submission. Updated to 'converted'
    // when the webhook confirms the booking, or to 'failed' / 'canceled' /
    // 'abandoned' via their respective paths. Non-fatal if the insert fails —
    // we still return a valid clientSecret so the user can complete payment.
    try {
      await supabase.from('guest_checkout_attempts').insert({
        location_id: locationId,
        guest_email: normalizedGuestEmail,
        guest_name: guestName || null,
        guest_phone: guestPhone || null,
        space_id: spaceId,
        start_time: p_start_time,
        end_time: p_end_time,
        party_size: partySize,
        amount_cents: amountCents,
        stripe_payment_intent_id: paymentIntent.id,
        booking_id: bookingId ?? null,
        status: 'pending',
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
      });
    } catch (err) {
      logger.warn({ err, paymentIntentId: paymentIntent.id }, 'Failed to insert guest_checkout_attempts row (non-fatal)');
    }

    return {
      clientSecret: paymentIntent.client_secret!,
      stripeAccountId: stripeOpts?.stripeAccount ?? null,
      amount: amountCents,
      expiresAt,
      reservationTimeoutMinutes: useReservationHold ? reservationTimeoutMinutes : null,
    };
  }

  async checkSlotAvailability(bookingId: string): Promise<boolean> {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('space_id, location_id, start_time, end_time')
      .eq('id', bookingId)
      .single();

    if (error || !booking) return false;

    // Check for any confirmed or active reserved booking in the same slot
    const now = new Date().toISOString();
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id, status, expires_at')
      .eq('space_id', booking.space_id)
      .eq('location_id', booking.location_id)
      .lt('start_time', booking.end_time)
      .gt('end_time', booking.start_time)
      .in('status', ['confirmed', 'reserved'])
      .neq('id', bookingId);

    if (!conflicts || conflicts.length === 0) return true;

    // Filter out expired reservations
    const activeConflicts = conflicts.filter(c => {
      if (c.status === 'reserved' && c.expires_at && c.expires_at < now) return false;
      return true;
    });

    return activeConflicts.length === 0;
  }

  async getBookings(locationId: string, date: string, startTime?: string) {
    if (!locationId || !date) {
      throw new Error('locationId and date are required parameters');
    }

    // First, get the location's timezone
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    if (locationError || !location) {
      logger.error({ err: locationError }, 'Error fetching location timezone');
      throw new Error('Invalid location ID');
    }

    const timezone = location.timezone || 'America/New_York';

    // For date range, always use start of day for the lower bound of start_time
    const startOfDayUTC = createISOTimestamp(date, '12:00 AM', timezone);

    // For end of day, use 11:59:59 PM to stay within the same day
    const endOfDayUTC = createISOTimestamp(date, '11:59 PM', timezone);

    // Add one minute to include 11:59 PM bookings but exclude midnight of next day
    const endOfDayPlusOneMinute = new Date(new Date(endOfDayUTC).getTime() + 60000).toISOString();

    // If startTime is provided (for "today" views), we need to filter out bookings that have already ended
    const filterEndTimeAfter = startTime ? createISOTimestamp(date, startTime, timezone) : null;

    logger.info({ date, timezone, startUTC: startOfDayUTC, endUTC: endOfDayPlusOneMinute, filterEndTimeAfter }, 'Fetching bookings');

    // Query bookings that OVERLAP with this date:
    // Either start_time falls on this date, OR the booking spans midnight and
    // end_time falls on this date (cross-midnight bookings from extensions)
    let query = supabase
      .from('bookings')
      .select('id, space_id, user_id, start_time, end_time, status, expires_at')
      .eq('location_id', locationId)
      .lt('start_time', endOfDayPlusOneMinute)
      .gt('end_time', startOfDayUTC)
      .neq('status', 'cancelled')
      .neq('status', 'expired')
      .neq('status', 'abandoned');

    // If startTime filter is provided, only include bookings that END after that time
    if (filterEndTimeAfter) {
      query = query.gt('end_time', filterEndTimeAfter);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error }, 'Error fetching bookings');
      throw new Error('Failed to fetch bookings');
    }

    // Filter out bookings that shouldn't block the timetable:
    // - Reserved bookings whose hold has expired
    // - Pending bookings with no expires_at (reservation holds off — slot not held during checkout)
    const now = new Date().toISOString();
    const activeBookings = data.filter(booking => {
      if (booking.status === 'reserved' && booking.expires_at && booking.expires_at < now) {
        return false;
      }
      if (booking.status === 'pending' && !booking.expires_at) {
        return false;
      }
      return true;
    });

    // Convert UTC timestamps to local time strings for the frontend time grid.
    // The grid uses 15-min slots from "12:00 AM" to "11:59 PM" (96 slots).
    // Cross-midnight bookings are clamped to the queried date and times are
    // snapped to slot boundaries so `timeToIndex` always finds a match.

    const dayStartMs = new Date(startOfDayUTC).getTime();
    const dayEndMs = new Date(endOfDayUTC).getTime();       // 11:59 PM local
    const dayMidnightMs = new Date(endOfDayPlusOneMinute).getTime(); // next midnight

    // Convert a UTC ms instant to minutes-since-midnight in the location's timezone
    const toLocalMinutes = (ms: number): number => {
      const d = new Date(ms);
      const h = parseInt(d.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }));
      const m = parseInt(d.toLocaleString('en-US', { minute: '2-digit', timeZone: timezone }));
      return h * 60 + m;
    };

    // Format minutes-since-midnight to "h:mm AM/PM"
    const minutesToTimeStr = (mins: number): string => {
      const h24 = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      const h12 = h24 % 12 || 12;
      const period = h24 < 12 ? 'AM' : 'PM';
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    const SLOT = 15; // minutes per grid slot

    const formattedBookings = activeBookings.map(booking => {
      const rawStartMs = new Date(booking.start_time).getTime();
      const rawEndMs = new Date(booking.end_time).getTime();

      // Clamp to the queried day's boundaries
      const clampedStartMs = Math.max(rawStartMs, dayStartMs);
      const clampedEndMs = Math.min(rawEndMs, dayMidnightMs);

      let startMin = toLocalMinutes(clampedStartMs);
      let endMin = toLocalMinutes(clampedEndMs);

      // Snap start DOWN to nearest slot boundary
      startMin = Math.floor(startMin / SLOT) * SLOT;

      // Snap end UP to nearest slot boundary (unless it's already at end-of-day)
      if (clampedEndMs >= dayMidnightMs) {
        // Booking extends to or past midnight — use "11:59 PM" (grid end marker)
        return {
          id: booking.id,
          spaceId: booking.space_id,
          userId: booking.user_id,
          startTime: minutesToTimeStr(startMin),
          endTime: '11:59 PM',
          startTimeISO: booking.start_time,
          endTimeISO: booking.end_time
        };
      }

      if (endMin % SLOT !== 0) {
        endMin = Math.ceil(endMin / SLOT) * SLOT;
      }
      // Handle end snapping past midnight (e.g. 23:50 snaps to 24:00 = 0)
      if (endMin >= 1440) endMin = 1440;

      return {
        id: booking.id,
        spaceId: booking.space_id,
        userId: booking.user_id,
        startTime: minutesToTimeStr(startMin),
        endTime: endMin >= 1440 ? '11:59 PM' : minutesToTimeStr(endMin),
        startTimeISO: booking.start_time,
        endTimeISO: booking.end_time
      };
    });

    return formattedBookings;
  }

  async getUserReservedBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, expires_at, space_id, location_id, spaces (name, space_number)')
      .eq('user_id', userId)
      .eq('status', 'reserved')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      logger.error({ err: error }, 'Error fetching reserved user bookings');
      throw new Error('Failed to fetch reserved user bookings');
    }

    if (!data || data.length === 0) {
      return { reservation: null };
    }

    const reservation = data[0];
    const formattedReservation = {
      id: reservation.id,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      totalAmount: reservation.total_amount,
      status: reservation.status,
      expiresAt: reservation.expires_at,
      spaceId: reservation.space_id,
      locationId: reservation.location_id,
      spaceName: (reservation.spaces as any)?.name || 'N/A',
      spaceNumber: (reservation.spaces as any)?.space_number || 'N/A'
    };

    return { reservation: formattedReservation };
  }

  async getUserFutureBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, spaces (name, space_number)')
      .eq('user_id', userId)
      .gte('end_time', now)
      .not('status', 'in', '("reserved","expired","abandoned","cancelled")')
      .order('start_time', { ascending: true });

    if (error) {
      logger.error({ err: error }, 'Error fetching future user bookings');
      throw new Error('Failed to fetch future user bookings');
    }

    const formattedBookings = data.map((booking: any) => ({
      id: booking.id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      totalAmount: booking.total_amount,
      status: booking.status,
      spaceName: booking.spaces?.name || 'N/A',
      spaceNumber: booking.spaces?.space_number || 'N/A'
    }));

    return formattedBookings;
  }

  async getUserPastBookings(userId: string, page = 1, pageSize = 20) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const cappedPageSize = Math.min(pageSize, 50);
    const from = (page - 1) * cappedPageSize;
    const to = from + cappedPageSize - 1;

    const now = new Date().toISOString();

    // Include bookings that have ended OR that were cancelled (even if their end_time is in the future)
    const { data, error, count } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, spaces (name, space_number)', { count: 'exact' })
      .eq('user_id', userId)
      .not('status', 'in', '("abandoned","reserved","expired")')
      .or(`end_time.lt.${now},status.eq.cancelled`)
      .order('start_time', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error({ err: error }, 'Error fetching past user bookings');
      throw new Error('Failed to fetch past user bookings');
    }

    const formattedBookings = (data || []).map((booking: any) => ({
      id: booking.id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      totalAmount: booking.total_amount,
      status: booking.status,
      spaceName: booking.spaces?.name || 'N/A',
      spaceNumber: booking.spaces?.space_number || 'N/A'
    }));

    return { data: formattedBookings, total: count || 0, page, pageSize: cappedPageSize };
  }

  // =====================================================
  // PROMOTION HELPERS
  // =====================================================

  async applyPromotionToBooking(
    bookingId: string,
    userId: string,
    promotionId: string,
    discountAmount: number,
    freeMinutes?: number
  ) {
    try {
      const success = await promotionService.applyPromotion({
        userId,
        bookingId,
        promotionId,
        discountAmount,
        freeMinutes
      });

      if (success) {
        logger.info({ promotionId, bookingId }, 'Successfully applied promotion to booking');
      }

      return success;
    } catch (error) {
      logger.error({ err: error, bookingId }, 'Error applying promotion to booking');
      return false;
    }
  }

  async getBookingDiscountInfo(
    userId: string,
    locationId: string,
    bookingMinutes: number,
    originalAmount: number,
    hourlyRate?: number
  ) {
    return promotionService.calculateDiscountSimple(
      userId,
      locationId,
      bookingMinutes,
      originalAmount,
      hourlyRate
    );
  }

  // =====================================================
  // DELEGATED METHODS — Cancellation
  // =====================================================

  async cancelBooking(bookingId: string, userId: string) {
    return this.cancelService.cancelBooking(bookingId, userId);
  }

  async employeeCancelBooking(bookingId: string, employeeId: string, reason?: string, skipRefund = false) {
    return this.cancelService.employeeCancelBooking(bookingId, employeeId, reason, skipRefund);
  }

  async cancelReservedBooking(bookingId: string, userId: string) {
    return this.cancelService.cancelReservedBooking(bookingId, userId);
  }

  // =====================================================
  // DELEGATED METHODS — Employee Operations
  // =====================================================

  async getAllBookingsForEmployee(locationId: string, startDate?: string, endDate?: string, spaceId?: string, customerEmail?: string) {
    return this.employeeService.getAllBookingsForEmployee(locationId, startDate, endDate, spaceId, customerEmail);
  }

  async searchCustomersByEmail(email: string, locationId: string) {
    return this.employeeService.searchCustomersByEmail(email, locationId);
  }

  async createEmployeeBooking(bookingData: Parameters<BookingEmployeeService['createEmployeeBooking']>[0], employeeId: string) {
    return this.employeeService.createEmployeeBooking(bookingData, employeeId);
  }

  async employeeRescheduleBooking(
    bookingId: string,
    newStartTime: string,
    newEndTime: string,
    locationId: string,
    spaceId: string,
    employeeId: string,
    adjustPrice: boolean = false
  ) {
    return this.employeeService.employeeRescheduleBooking(bookingId, newStartTime, newEndTime, locationId, spaceId, employeeId, adjustPrice);
  }

  // =====================================================
  // DELEGATED METHODS — Session Extensions
  // =====================================================

  async getExtensionOptions(bookingId: string, requestedOptions?: number[]) {
    return this.extensionService.getExtensionOptions(bookingId, requestedOptions);
  }

  async extendBooking(bookingId: string, extensionMinutes: number, locationId: string, spaceId: string, useFreeMinutes = false) {
    return this.extensionService.extendBooking(bookingId, extensionMinutes, locationId, spaceId, useFreeMinutes);
  }

  async employeeExtendBooking(
    bookingId: string,
    extensionMinutes: number,
    locationId: string,
    spaceId: string,
    employeeId: string,
    skipPayment: boolean = false
  ) {
    return this.extensionService.employeeExtendBooking(bookingId, extensionMinutes, locationId, spaceId, employeeId, skipPayment);
  }
}
