import Stripe from 'stripe';
import { supabase } from '../../../config/database';
import { EmailService } from '../../email/email.service';
import { SocketService } from '../../sockets/socket.service';
import { logger } from '../../../shared/utils/logger';

/**
 * Guest checkout: finalize a successful payment.
 *
 * The booking row is always pre-created before this fires:
 *   - Reservation-hold mode: inserted in createGuestCheckoutSession
 *   - No-hold mode: inserted in handleAmountCapturableUpdated (capture time)
 *
 * Either way the row has status='reserved' and payment_intent_id set. This
 * handler flips it to 'confirmed', writes the payment + agreement rows,
 * sends the confirmation email, and marks the funnel attempt as converted.
 *
 * Idempotent via status guard — webhook retries are a no-op after the
 * first successful confirm.
 */
export async function handleGuestPaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  socketService: SocketService,
): Promise<void> {
  const m = paymentIntent.metadata;
  const locationId = m.location_id;
  const spaceId = m.space_id;
  const guestEmail = m.guest_email ? m.guest_email.toLowerCase() : m.guest_email;
  const guestName = m.guest_name || null;
  const ipAddress = m.ip_address || null;
  const userAgent = m.user_agent || null;

  if (!locationId || !spaceId || !guestEmail) {
    logger.error({ paymentIntentId: paymentIntent.id }, 'Guest PI succeeded but metadata incomplete');
    return;
  }

  // Look up the pre-created booking row by PI id.
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('payment_intent_id', paymentIntent.id)
    .maybeSingle();

  if (fetchError || !booking) {
    logger.error({ err: fetchError, paymentIntentId: paymentIntent.id }, 'Guest booking row not found at succeeded — cannot finalize');
    return;
  }
  if (booking.status === 'confirmed') {
    // Webhook retry or parallel delivery. Re-emit the socket event in case
    // a reconnecting client missed the first one, then exit.
    socketService.emitPaymentStatus(paymentIntent.id, 'succeeded', { bookingId: booking.id });
    return;
  }

  const bookingId = booking.id;

  // Attribute to an existing user if this email already has an account.
  let attributedUserId: string | null = null;
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', guestEmail)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingProfile) {
    attributedUserId = existingProfile.id;
  }

  // Flip reservation → confirmed. Status guard guarantees idempotency
  // even if two webhook deliveries race.
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      expires_at: null,
      user_id: attributedUserId,
      notes: 'Guest booking',
    })
    .eq('id', bookingId)
    .in('status', ['reserved', 'pending']);

  if (updateError) {
    logger.error({ err: updateError, bookingId, paymentIntentId: paymentIntent.id }, 'Failed to confirm guest booking');
    return;
  }

  await supabase.from('payments').insert({
    booking_id: bookingId,
    amount: paymentIntent.amount / 100,
    status: 'succeeded',
    stripe_payment_intent_id: paymentIntent.id,
    currency: 'usd',
    user_id: attributedUserId,
    location_id: locationId,
    processed_at: new Date().toISOString(),
  });

  // Legal agreements using the hashes captured at form-submission time
  const agreementTypes = [
    'terms_of_service',
    'privacy_policy',
    'liability_waiver',
    'damage_fees_acknowledgment',
  ];
  const now = new Date().toISOString();
  const agreementRows = agreementTypes
    .map((type) => ({ type, hash: m[`doc_hash_${type}`] }))
    .filter(({ hash }) => !!hash)
    .map(({ type, hash }) => ({
      user_id: attributedUserId,
      signer_name: guestName || 'Guest',
      signer_email: guestEmail,
      booking_id: bookingId,
      location_id: locationId,
      agreement_type: type,
      agreement_version: '1.0',
      document_hash: hash,
      accepted_at: now,
      ip_address: ipAddress,
      user_agent: userAgent,
    }));

  if (agreementRows.length > 0) {
    const { error: agreementErr } = await supabase.from('user_agreements').insert(agreementRows);
    if (agreementErr) {
      logger.error({ err: agreementErr, bookingId }, 'Failed to record guest agreements');
    }
  }

  try {
    await EmailService.sendThankYouEmail(bookingId);
  } catch (emailErr) {
    logger.error({ err: emailErr, bookingId }, 'Failed to send guest confirmation email');
  }

  try {
    await socketService.triggerBookingUpdate(locationId, spaceId, bookingId);
  } catch (socketErr) {
    logger.error({ err: socketErr, bookingId }, 'Failed to notify kiosk of guest booking');
  }

  socketService.emitPaymentStatus(paymentIntent.id, 'succeeded', { bookingId });

  const { error: fnlErr } = await supabase
    .from('guest_checkout_attempts')
    .update({
      status: 'converted',
      booking_id: bookingId,
      converted_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .eq('status', 'pending');
  if (fnlErr) logger.warn({ err: fnlErr, paymentIntentId: paymentIntent.id }, 'Failed to mark guest_checkout_attempt converted');

  logger.info({ bookingId, paymentIntentId: paymentIntent.id }, 'Guest booking confirmed from payment success');
}
