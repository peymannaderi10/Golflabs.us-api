import Stripe from 'stripe';
import { stripe, getStripeOptions } from '../../../config/stripe';
import { supabase } from '../../../config/database';
import { logger } from '../../../shared/utils/logger';
import { SocketService } from '../../sockets/socket.service';

/**
 * Idempotent Stripe PI capture. If Stripe retries the webhook and this
 * fires twice, the second call returns `payment_intent_unexpected_state`
 * which we swallow as a no-op. Any other error rethrows so the outer
 * handler returns 500 and Stripe retries.
 */
export async function captureIdempotent(
  piId: string,
  stripeOpts: Stripe.RequestOptions | undefined,
): Promise<void> {
  try {
    await stripe.paymentIntents.capture(piId, undefined, stripeOpts);
  } catch (err: unknown) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'payment_intent_unexpected_state') {
      logger.info({ paymentIntentId: piId }, 'PI already in terminal state — idempotent capture skip');
      return;
    }
    throw err;
  }
}

/** Idempotent Stripe PI cancel (same rationale as captureIdempotent). */
export async function cancelIdempotent(
  piId: string,
  stripeOpts: Stripe.RequestOptions | undefined,
): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(piId, undefined, stripeOpts);
  } catch (err: unknown) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'payment_intent_unexpected_state') {
      logger.info({ paymentIntentId: piId }, 'PI already in terminal state — idempotent cancel skip');
      return;
    }
    throw err;
  }
}

/**
 * Fires when a manual-capture PaymentIntent has been authorized (card held,
 * not charged). Does the final validation check and either captures (money
 * moves, normal succeeded flow follows) or cancels (authorization released,
 * customer never charged).
 */
export async function handleAmountCapturableUpdated(
  pi: Stripe.PaymentIntent,
  socketService: SocketService,
): Promise<void> {
  // Fast-path idempotency: if already succeeded or canceled in the event
  // payload, skip. The capture/cancel helpers are the authoritative
  // idempotency guard — this just avoids an extra Stripe API call.
  if (pi.status !== 'requires_capture') {
    logger.info({ paymentIntentId: pi.id, status: pi.status }, 'PI not in requires_capture state — skipping');
    return;
  }

  const stripeOpts = pi.metadata.location_id ? await getStripeOptions(pi.metadata.location_id) : undefined;

  // Local wrappers: idempotent Stripe call + real-time client notification.
  // Every terminal transition in this handler goes through one of these so
  // the Return page sees the outcome instantly.
  const captureAndNotify = async () => {
    await captureIdempotent(pi.id, stripeOpts);
    // `succeeded` is emitted by the payment_intent.succeeded handler (which
    // fires after capture). We don't emit here to avoid a premature success.
  };
  const cancelAndNotify = async (reason: string) => {
    await cancelIdempotent(pi.id, stripeOpts);
    socketService.emitPaymentStatus(pi.id, 'canceled', { errorMessage: reason });

    // Funnel tracking — record why the attempt terminated, in the right
    // table based on flow type.
    if (pi.metadata.is_guest === 'true') {
      await supabase
        .from('guest_checkout_attempts')
        .update({ status: 'canceled', outcome_reason: reason, terminated_at: new Date().toISOString() })
        .eq('stripe_payment_intent_id', pi.id)
        .eq('status', 'pending');
    } else if (pi.metadata.booking_id) {
      // Authenticated flow: the booking row exists with status='reserved' or 'pending'.
      // The payment_intent.canceled webhook that follows will transition the
      // status, but we record the reason + termination time here since we have
      // the most specific context (slot_taken, reservation_timeout, etc.).
      await supabase
        .from('bookings')
        .update({ outcome_reason: reason, terminated_at: new Date().toISOString() })
        .eq('id', pi.metadata.booking_id)
        .in('status', ['reserved', 'pending']);
    }
  };

  // League enrollment payments: no slot check, capture immediately.
  if (pi.metadata.type === 'league_enrollment') {
    await captureAndNotify();
    return;
  }

  const bookingId = pi.metadata.booking_id;
  const isGuest = pi.metadata.is_guest === 'true';

  // Guest no-hold mode: no booking row exists yet. We claim the slot by
  // INSERTing a 'reserved' row BEFORE calling capture. The exclusion
  // constraint (migration 073) is the race arbiter — concurrent captures
  // serialize at the DB; losers get 23P01 and we cancel their auth, so
  // they are never charged. This is the correct place to resolve the
  // race (authorization, not capture) because a cancelled auth releases
  // the hold on the card without ever moving money.
  if (isGuest && !bookingId) {
    const spaceId = pi.metadata.space_id;
    const startTime = pi.metadata.start_time;
    const endTime = pi.metadata.end_time;
    const locationIdMeta = pi.metadata.location_id;
    const guestEmail = pi.metadata.guest_email || null;
    const guestName = pi.metadata.guest_name || null;
    const guestPhone = pi.metadata.guest_phone || null;
    const partySize = parseInt(pi.metadata.party_size || '1', 10);

    if (!spaceId || !startTime || !endTime || !locationIdMeta) {
      logger.error({ paymentIntentId: pi.id }, 'Guest PI missing slot metadata — cancelling');
      await cancelAndNotify('Your booking details were incomplete. Please try again.');
      return;
    }

    // Idempotency: if a prior webhook run already claimed the slot for
    // this PI, skip the INSERT and just re-run capture (which is itself
    // idempotent via captureIdempotent).
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('payment_intent_id', pi.id)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase
        .from('bookings')
        .insert({
          location_id: locationIdMeta,
          user_id: null,
          space_id: spaceId,
          start_time: startTime,
          end_time: endTime,
          party_size: partySize,
          total_amount: pi.amount / 100,
          status: 'reserved',
          payment_intent_id: pi.id,
          notes: 'Guest booking (pending capture)',
          guest_email: guestEmail,
          guest_name: guestName,
          guest_phone: guestPhone,
        });

      if (insertError) {
        if (insertError.code === '23P01') {
          logger.warn({ paymentIntentId: pi.id, spaceId, startTime }, 'Guest slot lost at capture-time INSERT — cancelling auth');
          await cancelAndNotify('Slot no longer available — your card was not charged.');
          return;
        }
        logger.error({ err: insertError, paymentIntentId: pi.id }, 'Failed to insert guest booking at capture — cancelling auth');
        await cancelAndNotify('Unable to confirm your booking. Please try again.');
        return;
      }
    } else if (existing.status === 'confirmed') {
      // Already fully processed by handleGuestPaymentSucceeded. Nothing to do.
      logger.info({ bookingId: existing.id, paymentIntentId: pi.id }, 'Guest booking already confirmed — skip');
      return;
    }

    // Slot is ours (reserved in our name). Capture the authorization.
    // If capture throws, roll back the reservation so the slot isn't
    // held by a dead PI. Stripe will either retry (idempotent via
    // captureIdempotent + the existing-row check above) or fire
    // payment_intent.payment_failed for terminal failures.
    try {
      await captureAndNotify();
    } catch (captureErr) {
      await supabase
        .from('bookings')
        .delete()
        .eq('payment_intent_id', pi.id)
        .eq('status', 'reserved');
      logger.error({ err: captureErr, paymentIntentId: pi.id }, 'Capture failed for guest booking — reservation rolled back');
      throw captureErr;
    }
    return;
  }

  // Authenticated flow + guest reservation-hold flow: booking row exists
  // already. Verify status + slot availability, then capture or cancel.
  if (bookingId) {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, status, expires_at, space_id, location_id, start_time, end_time')
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      logger.error({ paymentIntentId: pi.id, bookingId }, 'Booking not found at capture time — cancelling auth');
      await cancelAndNotify('Your booking could not be found. Please try again.');
      return;
    }

    // Reservation expired while user was on the payment form
    if (booking.status === 'reserved' && booking.expires_at) {
      if (new Date(booking.expires_at) < new Date()) {
        logger.warn({ bookingId, paymentIntentId: pi.id }, 'Reservation expired during payment — cancelling auth');
        await supabase.from('bookings').update({ status: 'expired' }).eq('id', bookingId);
        await cancelAndNotify('Your reservation expired. Your card was not charged.');
        return;
      }
    }

    // Booking was cancelled or already terminal — cancel auth.
    if (!['reserved', 'pending'].includes(booking.status)) {
      logger.warn({ bookingId, status: booking.status, paymentIntentId: pi.id }, 'Booking not in a payable state at capture — cancelling auth');
      await cancelAndNotify('This booking can no longer be paid for.');
      return;
    }

    // Belt-and-suspenders: re-check slot availability against other bookings.
    // (The booking row exists for this user/slot, so we exclude it from the check.)
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id, status, expires_at')
      .eq('space_id', booking.space_id)
      .in('status', ['confirmed', 'reserved'])
      .neq('id', bookingId)
      .lt('start_time', booking.end_time)
      .gt('end_time', booking.start_time);
    const activeConflicts = (conflicts || []).filter((c) => {
      if (c.status === 'reserved' && c.expires_at && new Date(c.expires_at) < new Date()) return false;
      return true;
    });
    if (activeConflicts.length > 0) {
      logger.warn({ bookingId, paymentIntentId: pi.id }, 'Slot conflict detected at capture — cancelling auth');
      await cancelAndNotify('Slot no longer available — your card was not charged.');
      return;
    }

    await captureAndNotify();
    return;
  }

  // No metadata we recognize — refuse to capture to be safe.
  logger.error({ paymentIntentId: pi.id, metadata: pi.metadata }, 'Unknown PI at capture — cancelling');
  await cancelAndNotify('An unexpected error occurred. Please contact support.');
}
