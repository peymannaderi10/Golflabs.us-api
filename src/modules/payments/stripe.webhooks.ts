import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, webhookSecret, connectWebhookSecret } from '../../config/stripe';
import { supabase } from '../../config/database';
import { EmailService } from '../email/email.service';
import { SocketService } from '../sockets/socket.service';
import { promotionService } from '../promotions/promotion.service';
import { LeagueService } from '../leagues/league.service';
import { MembershipService } from '../memberships/membership.service';
import { createUnlockToken } from '../../shared/utils/token.utils';
import { logger } from '../../shared/utils/logger';
import { LocationService } from '../locations/location.service';
import { stripeConnectService } from '../business/stripe-connect.service';
import { handleAmountCapturableUpdated } from './webhook-handlers/capture.handler';
import { handleGuestPaymentSucceeded } from './webhook-handlers/guest-payment.handler';
import {
  handleSubscriptionEvent,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from './webhook-handlers/subscription.handler';
import { handleRefundEvent, handleDisputeCreated } from './webhook-handlers/refund.handler';

export async function handleStripeWebhook(req: Request, res: Response, socketService: SocketService) {
  const sig = req.headers['stripe-signature'] as string;

  if (!webhookSecret) {
    logger.error('Stripe webhook secret not found');
    return res.status(400).send('Webhook Error: Missing secret');
  }

  // Two webhook endpoints in Stripe both deliver to this URL: the platform
  // endpoint (events on your own account) and the Connect endpoint (events
  // forwarded from connected accounts). Each is signed with its own secret.
  //
  // Connect events embed an `"account":"acct_..."` field at the top level
  // of the payload. Pre-routing on that hint lets us verify against the
  // most likely secret first and fall back to the other only when needed,
  // halving HMAC work on the steady-state high-volume path. Both
  // verifications still run against trusted env constants, never user
  // input, so the routing hint is purely an optimization — we never trust
  // it for the actual signature check.
  const rawBody = req.body as Buffer;
  const looksLikeConnectEvent =
    connectWebhookSecret !== null && rawBody.includes(Buffer.from('"account":"acct_'));
  const secretsInPriorityOrder: string[] = looksLikeConnectEvent
    ? [connectWebhookSecret as string, webhookSecret]
    : connectWebhookSecret
      ? [webhookSecret, connectWebhookSecret]
      : [webhookSecret];

  let event: Stripe.Event | null = null;
  let lastErr: unknown = null;
  for (const secret of secretsInPriorityOrder) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
      break;
    } catch (err: unknown) {
      lastErr = err;
    }
  }

  if (!event) {
    logger.error(
      { err: lastErr, triedSecrets: secretsInPriorityOrder.length },
      'Webhook signature verification failed against all configured secrets'
    );
    const msg = lastErr instanceof Error ? lastErr.message : 'unknown';
    return res.status(400).send(`Webhook Error: ${msg}`);
  }

  // Stripe Connect: extract connected account from the event (if present).
  // Stripe.Event.account is set on events forwarded from connected accounts;
  // unset on events from the platform account itself.
  const connectAccount: string | undefined = event.account ?? undefined;
  const webhookStripeOpts: Stripe.RequestOptions | undefined = connectAccount
    ? { stripeAccount: connectAccount }
    : undefined;

  // Handle the event based on type
  switch (event.type) {
    case 'payment_intent.amount_capturable_updated': {
      // Manual-capture path: card has been authorized, funds are held but
      // not yet charged. Do a final availability/validity check and either
      // capture (money moves) or cancel (authorization released, no charge).
      // On handler failure, return 500 so Stripe retries the webhook —
      // leaving a stuck authorization on the customer's card would be worse
      // than a retry.
      const pi = event.data.object as Stripe.PaymentIntent;
      try {
        await handleAmountCapturableUpdated(pi, socketService);
      } catch (err) {
        logger.error({ err, paymentIntentId: pi.id }, 'Capture handler failed — returning 500 for Stripe retry');
        return res.status(500).json({ error: 'Capture handler failed' });
      }
      return res.json({ received: true });
    }

    case 'payment_intent.succeeded':
    case 'payment_intent.canceled':
    case 'payment_intent.payment_failed':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      // --- LEAGUE ENROLLMENT PAYMENT ---
      if (paymentIntent.metadata.type === 'league_enrollment') {
        const leaguePlayerId = paymentIntent.metadata.league_player_id;
        const leagueId = paymentIntent.metadata.league_id;

        if (event.type === 'payment_intent.succeeded') {
          logger.info({ leaguePlayerId, leagueId }, 'League enrollment payment succeeded');

          try {
            // Activate the player enrollment
            const { error: playerError } = await supabase
              .from('league_players')
              .update({
                enrollment_status: 'active',
                season_paid: true,
                prize_pot_paid: true,
              })
              .eq('id', leaguePlayerId);

            if (playerError) {
              logger.error({ err: playerError, leaguePlayerId }, 'Error activating league player');
            } else {
              logger.info({ leaguePlayerId }, 'League player activated successfully');

              // Create league_standings row for the player
              const { error: standingsError } = await supabase
                .from('league_standings')
                .upsert({
                  league_id: leagueId,
                  league_player_id: leaguePlayerId,
                }, { onConflict: 'league_id,league_player_id' });

              if (standingsError) {
                logger.error({ err: standingsError, leaguePlayerId }, 'Error creating standings for league player');
              }

              // Insert prize pool contribution into the ledger
              const prizePotTotal = parseFloat(paymentIntent.metadata.prize_pot_total || '0');
              if (prizePotTotal > 0) {
                try {
                  const leagueService = new LeagueService();
                  await leagueService.insertPrizeContribution(
                    leagueId,
                    leaguePlayerId,
                    prizePotTotal,
                    `Prize pool buy-in ($${prizePotTotal.toFixed(2)})`
                  );
                  logger.info({ prizePotTotal, leaguePlayerId }, 'Inserted prize contribution');
                } catch (ledgerError) {
                  logger.error({ err: ledgerError }, 'Error inserting prize contribution');
                  // Non-fatal — enrollment is still active
                }
              }

              // If this is a team enrollment, check if all team members have paid
              const teamId = paymentIntent.metadata.league_team_id;
              if (teamId) {
                try {
                  const leagueService = new LeagueService();
                  const allPaid = await leagueService.checkTeamAllPaid(teamId);
                  if (allPaid) {
                    logger.info({ teamId }, 'All team members paid — team is now active');
                  }
                } catch (teamError) {
                  logger.error({ err: teamError }, 'Error checking team payment status');
                }
              }

              // Send enrollment confirmation email
              try {
                const { data: player } = await supabase
                  .from('league_players')
                  .select('user_id, display_name')
                  .eq('id', leaguePlayerId)
                  .single();

                const { data: league } = await supabase
                  .from('leagues')
                  .select('name, format, day_of_week, start_time, total_weeks, season_fee, weekly_prize_pot, status, location_id')
                  .eq('id', leagueId)
                  .single();

                const { data: firstWeek } = await supabase
                  .from('league_weeks')
                  .select('date')
                  .eq('league_id', leagueId)
                  .order('week_number')
                  .limit(1)
                  .single();

                if (player && league) {
                  const { data: userProfile } = await supabase
                    .from('user_profiles')
                    .select('email')
                    .eq('id', player.user_id)
                    .single();

                  if (userProfile?.email) {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const formatLabels: Record<string, string> = { stroke_play: 'Individual', team: 'Team' };
                    const prizePotTotal = parseFloat(paymentIntent.metadata.prize_pot_total || '0');
                    const totalPaid = (paymentIntent.amount || 0) / 100;
                    const startDate = firstWeek?.date
                      ? new Date(firstWeek.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                      : 'TBD';
                    const [h, m] = (league.start_time || '19:00').split(':');
                    const hour = parseInt(h, 10);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

                    const frontendUrl = process.env.FRONTEND_URL || 'https://app.golflabs.us';

                    EmailService.sendLeagueEnrollmentEmail(league.location_id, {
                      playerName: player.display_name,
                      playerEmail: userProfile.email,
                      leagueName: league.name,
                      format: formatLabels[league.format] || league.format,
                      dayOfWeek: dayNames[league.day_of_week] || 'TBD',
                      startTime: `${displayHour}:${m} ${ampm}`,
                      totalWeeks: league.total_weeks,
                      seasonFee: league.season_fee || 0,
                      prizePotTotal,
                      totalPaid,
                      startDate,
                      dashboardUrl: `${frontendUrl}/dashboard`,
                    });
                  }
                }
              } catch (emailError) {
                logger.error({ err: emailError }, 'Error sending enrollment confirmation email');
              }
            }
          } catch (leagueError) {
            logger.error({ err: leagueError }, 'Error processing league enrollment payment');
          }
        } else if (event.type === 'payment_intent.payment_failed') {
          logger.info({ leaguePlayerId, leagueId }, 'League enrollment payment failed');
          // Mark enrollment as failed
          await supabase
            .from('league_players')
            .update({ enrollment_status: 'pending' })
            .eq('id', leaguePlayerId);
        } else if (event.type === 'payment_intent.canceled') {
          logger.info({ leaguePlayerId, leagueId }, 'League enrollment payment cancelled');
          // Remove the pending player record
          await supabase
            .from('league_players')
            .delete()
            .eq('id', leaguePlayerId)
            .eq('enrollment_status', 'pending');
        }

        return res.json({ received: true });
      }

      const bookingId = paymentIntent.metadata.booking_id;
      const isGuest = paymentIntent.metadata.is_guest === 'true';

      // Guest checkout succeeded. Dual-mode (see handleGuestPaymentSucceeded):
      // reservation-hold mode flips a pre-existing row to 'confirmed';
      // no-hold mode INSERTs the booking now, with the exclusion constraint
      // arbitrating concurrent captures and auto-refunding the loser.
      if (isGuest && event.type === 'payment_intent.succeeded') {
        await handleGuestPaymentSucceeded(paymentIntent, socketService);
        return res.json({ received: true });
      }

      // Guest payment canceled/failed: update the funnel row. In
      // reservation-hold mode bookingId is present and we fall through
      // to the normal booking/payment update below. In no-hold mode
      // no booking row exists, so the fall-through is a no-op — we emit
      // the socket event here and return.
      if (isGuest && (event.type === 'payment_intent.canceled' || event.type === 'payment_intent.payment_failed')) {
        const newStatus = event.type === 'payment_intent.canceled' ? 'canceled' : 'failed';
        const errorMessage = paymentIntent.last_payment_error?.message || (newStatus === 'canceled' ? 'Payment was canceled.' : 'Payment could not be completed.');
        await supabase
          .from('guest_checkout_attempts')
          .update({
            status: newStatus,
            outcome_reason: errorMessage,
            terminated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .eq('status', 'pending');
        if (!bookingId) {
          socketService.emitPaymentStatus(paymentIntent.id, newStatus, { errorMessage });
          return res.json({ received: true });
        }
      }

      if (!bookingId) {
        logger.warn({ eventType: event.type }, 'Webhook received with no booking_id in metadata');
        return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
      }

      if (event.type === 'payment_intent.succeeded') {
        logger.info({ bookingId }, 'Payment succeeded, updating database');

        // Idempotency: skip if already confirmed (prevents double-processing on Stripe retry)
        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('status')
          .eq('id', bookingId)
          .single();

        if (existingBooking?.status === 'confirmed') {
          logger.info({ bookingId }, 'Booking already confirmed — idempotent skip');
          // Emit anyway in case a reconnecting client missed the original event
          socketService.emitPaymentStatus(paymentIntent.id, 'succeeded', { bookingId });
          return res.status(200).json({ received: true, message: 'Already processed' });
        }

        // Update booking status to 'confirmed' and clear expiration
        const { error: bookingError } = await supabase
          .from('bookings')
          .update({ status: 'confirmed', expires_at: null })
          .eq('id', bookingId);

        // Notify the Return page instantly that payment succeeded.
        socketService.emitPaymentStatus(paymentIntent.id, 'succeeded', { bookingId });
          
        // Update payment status to 'succeeded' and extract card details
        const paymentUpdate: any = { status: 'succeeded', processed_at: new Date().toISOString() };
        
        // Extract card details from the payment method for display (e.g., extension upsell confirmation)
        try {
          if (paymentIntent.payment_method) {
            const pmId = typeof paymentIntent.payment_method === 'string' 
              ? paymentIntent.payment_method 
              : paymentIntent.payment_method.id;
            const pm = await stripe.paymentMethods.retrieve(pmId, webhookStripeOpts);
            if (pm.card) {
              paymentUpdate.card_last_four = pm.card.last4;
              paymentUpdate.card_brand = pm.card.brand;
              paymentUpdate.payment_method = 'card';
              logger.info({ bookingId, cardBrand: pm.card.brand, cardLast4: pm.card.last4 }, 'Extracted card details');
            }
          }
        } catch (pmError: any) {
          logger.error({ err: pmError, bookingId }, 'Error retrieving payment method details');
        }

        const { error: paymentError } = await supabase
          .from('payments')
          .update(paymentUpdate)
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (bookingError || paymentError) {
          logger.error({ err: bookingError || paymentError, bookingId }, 'Error updating database after payment');
          return res.status(500).json({ error: 'Database update failed — Stripe will retry' });
        } else {
          logger.info({ bookingId }, 'Successfully updated booking to confirmed');

          // Apply promotion if one was used
          const promotionId = paymentIntent.metadata.promotion_id;
          const discountAmount = parseFloat(paymentIntent.metadata.discount_amount || '0');
          const freeMinutes = parseInt(paymentIntent.metadata.free_minutes || '0', 10);
          
          const userId = paymentIntent.metadata.user_id;
          if (promotionId && discountAmount > 0 && userId) {
            try {
              await promotionService.applyPromotion({
                userId,
                bookingId: bookingId,
                promotionId: promotionId,
                discountAmount: discountAmount,
                freeMinutes: freeMinutes || undefined
              });
              logger.info({ promotionId, bookingId, discountAmount }, 'Applied promotion to booking');
            } catch (promoError) {
              logger.error({ err: promoError, bookingId }, 'Error applying promotion to booking');
            }
          }

          // Deduct membership free minutes if used
          const membershipIdMeta = paymentIntent.metadata.membership_id;
          const memberFreeMinutes = parseFloat(paymentIntent.metadata.member_free_minutes_applied || '0');

          if (membershipIdMeta && memberFreeMinutes > 0) {
            try {
              const membershipService = new MembershipService();

              const { data: mem } = await supabase
                .from('memberships')
                .select('location_id')
                .eq('id', membershipIdMeta)
                .single();

              if (mem) {
                const memSettings = await membershipService.getLocationMembershipSettings(mem.location_id);
                if (!memSettings.membershipsEnabled) {
                  logger.info({ membershipId: membershipIdMeta, locationId: mem.location_id }, 'Skipping free minutes deduction — memberships disabled at location');
                } else {
                  await supabase.rpc('increment_free_minutes_used', {
                    p_membership_id: membershipIdMeta,
                    p_delta: memberFreeMinutes,
                  });

                  await membershipService.logUsage(membershipIdMeta, bookingId, 'free_minutes', memberFreeMinutes);
                  logger.info({ memberFreeMinutes, membershipId: membershipIdMeta, bookingId }, 'Deducted free minutes from membership');
                }
              }
            } catch (memberErr) {
              logger.error({ err: memberErr, bookingId }, 'Error deducting membership free minutes');
            }
          }
          
          // Send thank you email notification
          try {
            await EmailService.sendThankYouEmail(bookingId);
            logger.info({ bookingId }, 'Queued thank you email');
          } catch (emailError) {
            logger.error({ err: emailError, bookingId }, 'Error queuing thank you email');
            // Don't fail the webhook if email fails
          }

          // Trigger a real-time update for the kiosks at the location
          try {
            // We need the location_id and space_id from the booking to know which specific kiosk to notify.
            const { data: booking, error: fetchError } = await supabase
              .from('bookings')
              .select('location_id, space_id')
              .eq('id', bookingId)
              .single();

            if (fetchError || !booking?.location_id || !booking?.space_id) {
              logger.error({ err: fetchError, bookingId }, 'Could not fetch location_id and space_id for kiosk update');
            } else {
              logger.info({ locationId: booking.location_id, spaceId: booking.space_id }, 'Payment confirmed, triggering kiosk update');
              await socketService.triggerBookingUpdate(booking.location_id, booking.space_id, bookingId);
            }
          } catch (kioskError) {
            logger.error({ err: kioskError, bookingId }, 'Error triggering kiosk update');
          }

          // Check if booking starts within 15 minutes - if so, send reminder immediately
          try {
            const { data: bookingDetails, error: bookingFetchError } = await supabase
              .from('bookings')
              .select('start_time, end_time, location_id')
              .eq('id', bookingId)
              .single();

            if (!bookingFetchError && bookingDetails) {
              const now = new Date();
              const bookingStart = new Date(bookingDetails.start_time);
              const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

              logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Checked booking start time');

              if (minutesUntilStart <= 15) {
                logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Booking starts soon, sending immediate reminder');

                const doorLockType = await LocationService.getDoorLockType(bookingDetails.location_id);
                let unlockToken = '';
                let unlockLink = '';

                if (doorLockType !== 'none') {
                  unlockToken = createUnlockToken(bookingId, bookingDetails.start_time, bookingDetails.end_time);
                  unlockLink = `${process.env.FRONTEND_URL || 'https://app.golflabs.us'}/unlock?token=${unlockToken}`;

                  const { error: tokenUpdateError } = await supabase
                    .from('bookings')
                    .update({
                      unlock_token: unlockToken,
                      unlock_token_expires_at: bookingDetails.end_time
                    })
                    .eq('id', bookingId);

                  if (tokenUpdateError) {
                    logger.error({ err: tokenUpdateError, bookingId }, 'Error updating unlock token, skipping reminder');
                    return;
                  }
                }

                await EmailService.sendReminderEmail(bookingId, unlockToken, unlockLink);
                logger.info({ bookingId, doorLockType }, 'Sent immediate reminder email');
              }
            }
          } catch (reminderError) {
            logger.error({ err: reminderError, bookingId }, 'Error handling immediate reminder');
          }
        }
      } else if (event.type === 'payment_intent.canceled') {
        logger.info({ bookingId }, 'Payment canceled, updating database');

        // Update booking status to 'cancelled' + funnel tracking
        const { error: cancelBookingError } = await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            outcome_reason: paymentIntent.cancellation_reason || 'stripe_cancelled',
            terminated_at: new Date().toISOString(),
          })
          .eq('id', bookingId)
          .neq('status', 'confirmed'); // Don't cancel a booking that is already confirmed

        // Update payment status to 'cancelled'
        const { error: cancelPaymentError } = await supabase
          .from('payments')
          .update({ status: 'cancelled' })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (cancelBookingError || cancelPaymentError) {
          logger.error({ err: cancelBookingError || cancelPaymentError, bookingId }, 'Error updating database after payment cancellation');
        } else {
          logger.info({ bookingId }, 'Successfully updated booking to cancelled');
        }
        // Notify the Return page in real-time
        socketService.emitPaymentStatus(paymentIntent.id, 'canceled', { bookingId });
      } else if (event.type === 'payment_intent.payment_failed') {
        logger.info({ bookingId }, 'Payment failed');
        // Update payment record to failed. The booking remains 'reserved' until it expires.
        const { error: paymentFailedError } = await supabase
          .from('payments')
          .update({ status: 'failed' })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (paymentFailedError) {
          logger.error({ err: paymentFailedError, bookingId }, 'Error updating payment status to failed');
        }
        // Notify the Return page in real-time
        const errorMessage = paymentIntent.last_payment_error?.message || 'Payment could not be completed.';
        socketService.emitPaymentStatus(paymentIntent.id, 'failed', { bookingId, errorMessage });
      }
      break;

    // Free booking: SetupIntent succeeded — confirm booking and save payment method
    case 'setup_intent.succeeded': {
      const setupIntent = event.data.object as Stripe.SetupIntent;
      const setupMetadata = setupIntent.metadata || {};
      const setupBookingId = setupMetadata.booking_id;

      if (!setupBookingId) {
        logger.warn({ setupIntentId: setupIntent.id }, 'SetupIntent webhook received with no booking_id in metadata');
        return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
      }

      logger.info({ bookingId: setupBookingId }, 'Setup intent succeeded for free booking, confirming');

      // Update booking status to 'confirmed' and clear expiration
      const { error: setupBookingError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed', expires_at: null })
        .eq('id', setupBookingId);

      // Notify the Return page instantly (free bookings come through SetupIntent)
      socketService.emitPaymentStatus(setupIntent.id, 'succeeded', { bookingId: setupBookingId });

      // Update payment record to 'succeeded' and extract card details
      const setupPaymentUpdate: any = { status: 'succeeded', processed_at: new Date().toISOString() };

      try {
        if (setupIntent.payment_method) {
          const pmId = typeof setupIntent.payment_method === 'string'
            ? setupIntent.payment_method
            : setupIntent.payment_method.id;
          const pm = await stripe.paymentMethods.retrieve(pmId, webhookStripeOpts);
          if (pm.card) {
            setupPaymentUpdate.card_last_four = pm.card.last4;
            setupPaymentUpdate.card_brand = pm.card.brand;
            setupPaymentUpdate.payment_method = 'card';
            logger.info({ bookingId: setupBookingId, cardBrand: pm.card.brand, cardLast4: pm.card.last4 }, 'Extracted card details for free booking');
          }
        }
      } catch (pmError: any) {
        logger.error({ err: pmError, bookingId: setupBookingId }, 'Error retrieving payment method for free booking');
      }

      const { error: setupPaymentError } = await supabase
        .from('payments')
        .update(setupPaymentUpdate)
        .eq('stripe_payment_intent_id', setupIntent.id);

      if (setupBookingError || setupPaymentError) {
        logger.error({ err: setupBookingError || setupPaymentError, bookingId: setupBookingId }, 'Error updating database after setup for free booking');
      } else {
        logger.info({ bookingId: setupBookingId }, 'Successfully confirmed free booking');

        // Apply promotion if one was used
        const setupPromotionId = setupMetadata.promotion_id;
        const setupDiscountAmount = parseFloat(setupMetadata.discount_amount || '0');
        const setupFreeMinutes = parseInt(setupMetadata.free_minutes || '0', 10);

        const setupUserId = setupMetadata.user_id;
        if (setupPromotionId && setupDiscountAmount > 0 && setupUserId) {
          try {
            await promotionService.applyPromotion({
              userId: setupUserId,
              bookingId: setupBookingId,
              promotionId: setupPromotionId,
              discountAmount: setupDiscountAmount,
              freeMinutes: setupFreeMinutes || undefined
            });
            logger.info({ promotionId: setupPromotionId, bookingId: setupBookingId }, 'Applied promotion to free booking');
          } catch (promoError) {
            logger.error({ err: promoError, bookingId: setupBookingId }, 'Error applying promotion to free booking');
          }
        }

        // Deduct membership free minutes if used (free booking covered entirely by member hours)
        const setupMembershipId = setupMetadata.membership_id;
        const setupMemberFreeMinutes = parseFloat(setupMetadata.member_free_minutes_applied || '0');

        if (setupMembershipId && setupMemberFreeMinutes > 0) {
          try {
            const membershipService = new MembershipService();

            const { data: mem } = await supabase
              .from('memberships')
              .select('location_id')
              .eq('id', setupMembershipId)
              .single();

            if (mem) {
              const memSettings = await membershipService.getLocationMembershipSettings(mem.location_id);
              if (!memSettings.membershipsEnabled) {
                logger.info({ membershipId: setupMembershipId, locationId: mem.location_id }, 'Skipping free minutes deduction — memberships disabled at location');
              } else {
                await supabase.rpc('increment_free_minutes_used', {
                  p_membership_id: setupMembershipId,
                  p_delta: setupMemberFreeMinutes,
                });

                await membershipService.logUsage(setupMembershipId, setupBookingId, 'free_minutes', setupMemberFreeMinutes);
                logger.info({ memberFreeMinutes: setupMemberFreeMinutes, membershipId: setupMembershipId, bookingId: setupBookingId }, 'Deducted free minutes from membership for free booking');
              }
            }
          } catch (memberErr) {
            logger.error({ err: memberErr, bookingId: setupBookingId }, 'Error deducting membership free minutes for free booking');
          }
        }

        // Send thank you email
        try {
          await EmailService.sendThankYouEmail(setupBookingId);
          logger.info({ bookingId: setupBookingId }, 'Queued thank you email for free booking');
        } catch (emailError) {
          logger.error({ err: emailError, bookingId: setupBookingId }, 'Error queuing thank you email for free booking');
        }

        // Trigger kiosk update
        try {
          const { data: setupBooking, error: setupFetchError } = await supabase
            .from('bookings')
            .select('location_id, space_id')
            .eq('id', setupBookingId)
            .single();

          if (!setupFetchError && setupBooking?.location_id && setupBooking?.space_id) {
            logger.info({ locationId: setupBooking.location_id, spaceId: setupBooking.space_id }, 'Free booking confirmed, triggering kiosk update');
            await socketService.triggerBookingUpdate(setupBooking.location_id, setupBooking.space_id, setupBookingId);
          }
        } catch (kioskError) {
          logger.error({ err: kioskError, bookingId: setupBookingId }, 'Error triggering kiosk update for free booking');
        }

        // Check if booking starts within 15 minutes — send reminder immediately
        try {
          const { data: setupBookingDetails, error: setupBookingFetchError } = await supabase
            .from('bookings')
            .select('start_time, end_time, location_id')
            .eq('id', setupBookingId)
            .single();

          if (!setupBookingFetchError && setupBookingDetails) {
            const now = new Date();
            const bookingStart = new Date(setupBookingDetails.start_time);
            const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

            if (minutesUntilStart <= 15) {
              logger.info({ bookingId: setupBookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Free booking starts soon, sending immediate reminder');

              const doorLockType = await LocationService.getDoorLockType(setupBookingDetails.location_id);
              let unlockToken = '';
              let unlockLink = '';

              if (doorLockType !== 'none') {
                unlockToken = createUnlockToken(setupBookingId, setupBookingDetails.start_time, setupBookingDetails.end_time);
                unlockLink = `${process.env.FRONTEND_URL || 'https://app.golflabs.us'}/unlock?token=${unlockToken}`;

                await supabase
                  .from('bookings')
                  .update({
                    unlock_token: unlockToken,
                    unlock_token_expires_at: setupBookingDetails.end_time
                  })
                  .eq('id', setupBookingId);
              }

              await EmailService.sendReminderEmail(setupBookingId, unlockToken, unlockLink);
              logger.info({ bookingId: setupBookingId, doorLockType }, 'Sent immediate reminder email for free booking');
            }
          }
        } catch (reminderError) {
          logger.error({ err: reminderError, bookingId: setupBookingId }, 'Error handling immediate reminder for free booking');
        }
      }

      break;
    }

    // =====================================================
    // MEMBERSHIP SUBSCRIPTION WEBHOOKS
    // =====================================================
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionEvent(event);
      return res.json({ received: true });

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return res.json({ received: true });

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return res.json({ received: true });

    // Stripe Connect: connected account capability changed
    // (e.g. owner finished onboarding, charges_enabled flipped to true)
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      try {
        await stripeConnectService.syncAccountStatus(account.id);
        logger.info(
          { accountId: account.id, chargesEnabled: account.charges_enabled },
          'Synced Stripe Connect account status'
        );
      } catch (err) {
        logger.error({ err, accountId: account.id }, 'Failed to sync account.updated event');
      }
      return res.json({ received: true });
    }

    case 'charge.dispute.created':
      handleDisputeCreated(event.data.object as Stripe.Dispute);
      break;

    default:
      if (event.type.startsWith('refund.')) {
        await handleRefundEvent(event);
      } else {
        logger.info({ eventType: event.type }, 'Unhandled event type');
      }
      break;
  }

  res.json({ received: true });
}

