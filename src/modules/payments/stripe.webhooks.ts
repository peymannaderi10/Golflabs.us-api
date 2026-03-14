import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, webhookSecret } from '../../config/stripe';
import { supabase } from '../../config/database';
import { EmailService } from '../email/email.service';
import { SocketService } from '../sockets/socket.service';
import { promotionService } from '../promotions/promotion.service';
import { LeagueService } from '../leagues/league.service';
import { MembershipService } from '../memberships/membership.service';
import { createUnlockToken } from '../../shared/utils/token.utils';
import { logger } from '../../shared/utils/logger';

export async function handleStripeWebhook(req: Request, res: Response, socketService: SocketService) {
  const sig = req.headers['stripe-signature'] as string;

  if (!webhookSecret) {
    logger.error('Stripe webhook secret not found');
    return res.status(400).send('Webhook Error: Missing secret');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error({ err }, 'Webhook signature verification failed');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event based on type
  switch (event.type) {
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
                    const formatLabels: Record<string, string> = { stroke_play: 'Individual (Stroke Play)', team: 'Team' };
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

      if (!bookingId) {
        logger.warn({ eventType: event.type }, 'Webhook received with no booking_id in metadata');
        return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
      }

      if (event.type === 'payment_intent.succeeded') {
        logger.info({ bookingId }, 'Payment succeeded, updating database');

        // Update booking status to 'confirmed' and clear expiration
        const { error: bookingError } = await supabase
          .from('bookings')
          .update({ status: 'confirmed', expires_at: null })
          .eq('id', bookingId);
          
        // Update payment status to 'succeeded' and extract card details
        const paymentUpdate: any = { status: 'succeeded', processed_at: new Date().toISOString() };
        
        // Extract card details from the payment method for display (e.g., extension upsell confirmation)
        try {
          if (paymentIntent.payment_method) {
            const pmId = typeof paymentIntent.payment_method === 'string' 
              ? paymentIntent.payment_method 
              : paymentIntent.payment_method.id;
            const pm = await stripe.paymentMethods.retrieve(pmId);
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
        } else {
          logger.info({ bookingId }, 'Successfully updated booking to confirmed');
          
          // Apply promotion if one was used
          const promotionId = paymentIntent.metadata.promotion_id;
          const discountAmount = parseFloat(paymentIntent.metadata.discount_amount || '0');
          const freeMinutes = parseInt(paymentIntent.metadata.free_minutes || '0', 10);
          
          if (promotionId && discountAmount > 0) {
            try {
              await promotionService.applyPromotion({
                userId: paymentIntent.metadata.user_id,
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
                .select('free_minutes_used, location_id')
                .eq('id', membershipIdMeta)
                .single();

              if (mem) {
                const memSettings = await membershipService.getLocationMembershipSettings(mem.location_id);
                if (!memSettings.membershipsEnabled) {
                  logger.info({ membershipId: membershipIdMeta, locationId: mem.location_id }, 'Skipping free minutes deduction — memberships disabled at location');
                } else {
                  await supabase
                    .from('memberships')
                    .update({ free_minutes_used: (mem.free_minutes_used || 0) + memberFreeMinutes })
                    .eq('id', membershipIdMeta);

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
            // We need the location_id and bay_id from the booking to know which specific kiosk to notify.
            const { data: booking, error: fetchError } = await supabase
              .from('bookings')
              .select('location_id, bay_id')
              .eq('id', bookingId)
              .single();

            if (fetchError || !booking?.location_id || !booking?.bay_id) {
              logger.error({ err: fetchError, bookingId }, 'Could not fetch location_id and bay_id for kiosk update');
            } else {
              logger.info({ locationId: booking.location_id, bayId: booking.bay_id }, 'Payment confirmed, triggering kiosk update');
              await socketService.triggerBookingUpdate(booking.location_id, booking.bay_id, bookingId);
            }
          } catch (kioskError) {
            logger.error({ err: kioskError, bookingId }, 'Error triggering kiosk update');
          }

          // Check if booking starts within 15 minutes - if so, send reminder immediately
          try {
            // Get booking details to check start time
            const { data: bookingDetails, error: bookingFetchError } = await supabase
              .from('bookings')
              .select('start_time, end_time')
              .eq('id', bookingId)
              .single();

            if (!bookingFetchError && bookingDetails) {
              const now = new Date();
              const bookingStart = new Date(bookingDetails.start_time);
              const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

              logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Checked booking start time');

              // If booking starts within 15 minutes, send reminder email immediately
              if (minutesUntilStart <= 15) {
                logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Booking starts soon, sending immediate reminder');
                
                // Generate unlock token and link (same as reminder job)
                const unlockToken = createUnlockToken(bookingId, bookingDetails.start_time, bookingDetails.end_time);
                const unlockLink = `${process.env.FRONTEND_URL || 'https://app.golflabs.us'}/unlock?token=${unlockToken}`;

                // Update booking with unlock token
                await supabase
                  .from('bookings')
                  .update({
                    unlock_token: unlockToken,
                    unlock_token_expires_at: bookingDetails.end_time
                  })
                  .eq('id', bookingId);

                // Send reminder email immediately
                await EmailService.sendReminderEmail(bookingId, unlockToken, unlockLink);
                logger.info({ bookingId }, 'Sent immediate reminder email');
              }
            }
          } catch (reminderError) {
            logger.error({ err: reminderError, bookingId }, 'Error handling immediate reminder');
            // Don't fail the webhook if reminder fails
          }
        }
      } else if (event.type === 'payment_intent.canceled') {
        logger.info({ bookingId }, 'Payment canceled, updating database');

        // Update booking status to 'cancelled'
        const { error: cancelBookingError } = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
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

      // Update payment record to 'succeeded' and extract card details
      const setupPaymentUpdate: any = { status: 'succeeded', processed_at: new Date().toISOString() };

      try {
        if (setupIntent.payment_method) {
          const pmId = typeof setupIntent.payment_method === 'string'
            ? setupIntent.payment_method
            : setupIntent.payment_method.id;
          const pm = await stripe.paymentMethods.retrieve(pmId);
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

        if (setupPromotionId && setupDiscountAmount > 0) {
          try {
            await promotionService.applyPromotion({
              userId: setupMetadata.user_id,
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
              .select('free_minutes_used, location_id')
              .eq('id', setupMembershipId)
              .single();

            if (mem) {
              const memSettings = await membershipService.getLocationMembershipSettings(mem.location_id);
              if (!memSettings.membershipsEnabled) {
                logger.info({ membershipId: setupMembershipId, locationId: mem.location_id }, 'Skipping free minutes deduction — memberships disabled at location');
              } else {
                await supabase
                  .from('memberships')
                  .update({ free_minutes_used: (mem.free_minutes_used || 0) + setupMemberFreeMinutes })
                  .eq('id', setupMembershipId);

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
            .select('location_id, bay_id')
            .eq('id', setupBookingId)
            .single();

          if (!setupFetchError && setupBooking?.location_id && setupBooking?.bay_id) {
            logger.info({ locationId: setupBooking.location_id, bayId: setupBooking.bay_id }, 'Free booking confirmed, triggering kiosk update');
            await socketService.triggerBookingUpdate(setupBooking.location_id, setupBooking.bay_id, setupBookingId);
          }
        } catch (kioskError) {
          logger.error({ err: kioskError, bookingId: setupBookingId }, 'Error triggering kiosk update for free booking');
        }

        // Check if booking starts within 15 minutes — send reminder immediately
        try {
          const { data: setupBookingDetails, error: setupBookingFetchError } = await supabase
            .from('bookings')
            .select('start_time, end_time')
            .eq('id', setupBookingId)
            .single();

          if (!setupBookingFetchError && setupBookingDetails) {
            const now = new Date();
            const bookingStart = new Date(setupBookingDetails.start_time);
            const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

            if (minutesUntilStart <= 15) {
              logger.info({ bookingId: setupBookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Free booking starts soon, sending immediate reminder');

              const unlockToken = createUnlockToken(setupBookingId, setupBookingDetails.start_time, setupBookingDetails.end_time);
              const unlockLink = `${process.env.FRONTEND_URL || 'https://app.golflabs.us'}/unlock?token=${unlockToken}`;

              await supabase
                .from('bookings')
                .update({
                  unlock_token: unlockToken,
                  unlock_token_expires_at: setupBookingDetails.end_time
                })
                .eq('id', setupBookingId);

              await EmailService.sendReminderEmail(setupBookingId, unlockToken, unlockLink);
              logger.info({ bookingId: setupBookingId }, 'Sent immediate reminder email for free booking');
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
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const subMeta = subscription.metadata || {};
      const subUserId = subMeta.user_id;
      const subPlanId = subMeta.plan_id;
      const subLocationId = subMeta.location_id;

      if (!subUserId) {
        logger.warn({ eventType: event.type }, 'Subscription webhook has no user_id metadata, ignoring');
        return res.json({ received: true });
      }

      // Map Stripe subscription status to our status
      let membershipStatus = subscription.status as string;
      if (subscription.status === 'active' && subscription.cancel_at_period_end) {
        membershipStatus = 'active'; // still active until period ends
      }

      const safeTimestamp = (ts: number | null | undefined): string | null => {
        if (!ts || typeof ts !== 'number') return null;
        const d = new Date(ts * 1000);
        return isNaN(d.getTime()) ? null : d.toISOString();
      };

      if (event.type === 'customer.subscription.created') {
        logger.info({ userId: subUserId, planId: subPlanId }, 'Subscription created');
        if (subscription.status === 'active') {
          const updateFields: any = { status: 'active' };
          const periodStart = safeTimestamp(subscription.current_period_start);
          const periodEnd = safeTimestamp(subscription.current_period_end);
          if (periodStart) updateFields.current_period_start = periodStart;
          if (periodEnd) updateFields.current_period_end = periodEnd;

          await supabase
            .from('memberships')
            .update(updateFields)
            .eq('stripe_subscription_id', subscription.id);

          // Send welcome email
          sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
        }
      } else if (event.type === 'customer.subscription.updated') {
        logger.info({ userId: subUserId, status: subscription.status }, 'Subscription updated');

        const previousAttributes = (event.data as any).previous_attributes;
        const wasIncomplete = previousAttributes?.status && previousAttributes.status !== 'active' && subscription.status === 'active';

        const updateData: any = {
          status: membershipStatus,
        };
        const periodStart = safeTimestamp(subscription.current_period_start);
        const periodEnd = safeTimestamp(subscription.current_period_end);
        if (periodStart) updateData.current_period_start = periodStart;
        if (periodEnd) updateData.current_period_end = periodEnd;

        if (subPlanId) {
          updateData.plan_id = subPlanId;
        }

        if (subscription.cancel_at_period_end) {
          updateData.canceled_at = new Date().toISOString();
        } else {
          updateData.canceled_at = null;
        }

        await supabase
          .from('memberships')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id);

        // Send welcome email when transitioning to active (e.g. from incomplete)
        if (wasIncomplete) {
          sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
        }
      } else if (event.type === 'customer.subscription.deleted') {
        logger.info({ userId: subUserId }, 'Subscription deleted');

        await supabase
          .from('memberships')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
      }

      return res.json({ received: true });
    }

    case 'invoice.paid': {
      const paidInvoice = event.data.object as Stripe.Invoice;
      const invoiceSubId = paidInvoice.subscription as string | null;

      if (invoiceSubId && paidInvoice.billing_reason === 'subscription_cycle') {
        // Only reset usage on actual renewals, not the initial subscription invoice
        logger.info({ subscriptionId: invoiceSubId }, 'Subscription renewal invoice paid, resetting usage counters');

        const { error: resetErr } = await supabase
          .from('memberships')
          .update({
            status: 'active',
            free_minutes_used: 0,
            guest_passes_used: 0,
          })
          .eq('stripe_subscription_id', invoiceSubId);

        if (resetErr) {
          logger.error({ err: resetErr, subscriptionId: invoiceSubId }, 'Error resetting usage for subscription');
        }
      } else if (invoiceSubId) {
        // First invoice or other billing reason — just ensure active status
        logger.info({ subscriptionId: invoiceSubId, billingReason: paidInvoice.billing_reason }, 'Invoice paid for subscription');

        await supabase
          .from('memberships')
          .update({ status: 'active' })
          .eq('stripe_subscription_id', invoiceSubId);
      }
      return res.json({ received: true });
    }

    case 'invoice.payment_failed': {
      const failedInvoice = event.data.object as Stripe.Invoice;
      const failedSubId = failedInvoice.subscription as string | null;

      if (failedSubId) {
        logger.info({ subscriptionId: failedSubId }, 'Invoice payment failed');

        await supabase
          .from('memberships')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', failedSubId);
      }
      return res.json({ received: true });
    }

    // Refund webhook handlers
    case 'charge.dispute.created':
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = dispute.charge;
      logger.info({ chargeId }, 'Dispute created, handling dispute');

      // Find the payment record by charge ID (you may need to store charge_id in payments table)
      // For now, we'll log this and handle manually
      logger.warn({ chargeId }, 'Dispute created, manual review required');
      break;

    default:
      // Handle refund events that may not be in the main Stripe.Event type
      if (event.type.startsWith('refund.')) {
        const refundEvent = event as any; // Type assertion for refund events
        const refund = refundEvent.data.object as Stripe.Refund;
        const refundBookingId = refund.metadata?.booking_id;
        const refundLeaguePlayerId = refund.metadata?.league_player_id;
        const refundLeagueId = refund.metadata?.league_id;

        // League enrollment refund
        if (refundLeaguePlayerId && refundLeagueId) {
          if (event.type === 'refund.created') {
            logger.info({ leaguePlayerId: refundLeaguePlayerId, leagueId: refundLeagueId, refundId: refund.id }, 'League refund created');

            const { error: leagueRefundError } = await supabase
              .from('league_players')
              .update({
                season_paid: false,
                prize_pot_paid: false,
                enrollment_status: 'withdrawn',
              })
              .eq('id', refundLeaguePlayerId);

            if (leagueRefundError) {
              logger.error({ err: leagueRefundError, leaguePlayerId: refundLeaguePlayerId }, 'Error updating league player on refund');
            } else {
              logger.info({ leaguePlayerId: refundLeaguePlayerId }, 'League player marked as withdrawn (refund created)');
            }
          } else if (event.type === 'refund.updated') {
            logger.info({ leaguePlayerId: refundLeaguePlayerId, refundStatus: refund.status }, 'League refund updated');

            if (refund.status === 'succeeded') {
              const { error } = await supabase
                .from('league_players')
                .update({ enrollment_status: 'withdrawn', season_paid: false, prize_pot_paid: false })
                .eq('id', refundLeaguePlayerId);

              if (error) {
                logger.error({ err: error, leaguePlayerId: refundLeaguePlayerId }, 'Error finalizing league refund');
              } else {
                logger.info({ leaguePlayerId: refundLeaguePlayerId }, 'League refund succeeded, status: withdrawn');
              }
            } else if (refund.status === 'failed') {
              logger.error({ leaguePlayerId: refundLeaguePlayerId }, 'League refund FAILED, manual review required');
            }
          }
          break;
        }

        // Booking refund
        if (!refundBookingId) {
          logger.warn({ refundId: refund.id, eventType: event.type }, 'Refund webhook received with no booking_id or league_player_id in metadata');
          break;
        }

        if (event.type === 'refund.created') {
          logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund created for booking');

          const { error: refundCreateError } = await supabase
            .from('payments')
            .update({ 
              status: 'refunding',
              refund_amount: refund.amount / 100,
              refunded_at: new Date().toISOString()
            })
            .eq('booking_id', refundBookingId);

          if (refundCreateError) {
            logger.error({ err: refundCreateError, bookingId: refundBookingId }, 'Error updating payment with refund info');
          } else {
            logger.info({ bookingId: refundBookingId }, 'Successfully updated payment record with refund info');
          }
        } else if (event.type === 'refund.updated') {
          logger.info({ bookingId: refundBookingId, refundStatus: refund.status }, 'Refund updated for booking');

          let paymentStatus = 'refunding';
          if (refund.status === 'succeeded') {
            paymentStatus = 'refunded';
          } else if (refund.status === 'failed') {
            paymentStatus = 'refund_failed';
          }

          const { error: refundUpdateError } = await supabase
            .from('payments')
            .update({ 
              status: paymentStatus,
              refund_amount: refund.amount / 100,
              refunded_at: refund.status === 'succeeded' ? new Date().toISOString() : undefined
            })
            .eq('booking_id', refundBookingId);

          if (refundUpdateError) {
            logger.error({ err: refundUpdateError, bookingId: refundBookingId }, 'Error updating payment refund status');
          } else {
            logger.info({ paymentStatus, bookingId: refundBookingId }, 'Successfully updated payment refund status');
          }
        } else if (event.type.includes('refund') && event.type.includes('failed')) {
          logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund failed for booking');

          const { error: refundFailedError } = await supabase
            .from('payments')
            .update({ 
              status: 'refund_failed'
            })
            .eq('booking_id', refundBookingId);

          const { error: cancellationUpdateError } = await supabase
            .from('bookings_cancellations')
            .update({ 
              cancellation_reason: `Refund failed: ${refund.failure_reason || 'Unknown reason'}. Manual processing required.`
            })
            .eq('booking_id', refundBookingId);

          if (refundFailedError || cancellationUpdateError) {
            logger.error({ err: refundFailedError || cancellationUpdateError, bookingId: refundBookingId }, 'Error updating records for failed refund');
          } else {
            logger.info({ bookingId: refundBookingId }, 'Updated records for failed refund');
          }
        }
      } else {
        logger.info({ eventType: event.type }, 'Unhandled event type');
      }
      break;
  }

  res.json({ received: true });
}

async function sendMembershipWelcomeEmailFromWebhook(
  subscription: Stripe.Subscription,
  userId: string,
  planId?: string,
  locationId?: string
): Promise<void> {
  try {
    if (!planId || !locationId) return;

    const { data: membership } = await supabase
      .from('memberships')
      .select('*, membership_plans(*)')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    if (!membership) return;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single();

    if (!profile?.email || !location) return;

    const plan = membership.membership_plans;
    const benefits = plan.benefits || {};

    await EmailService.sendMembershipWelcomeEmail(locationId, {
      userFullName: profile.full_name || 'Member',
      userEmail: profile.email,
      planName: plan.name,
      billingInterval: membership.billing_interval,
      price: membership.billing_interval === 'annual' ? Number(plan.annual_price || plan.monthly_price) : Number(plan.monthly_price),
      locationName: location.name,
      freeHoursPerMonth: benefits.freeMinutesPerMonth ? benefits.freeMinutesPerMonth / 60 : undefined,
      bookingWindowDays: benefits.bookingWindowDays,
      guestPassesPerMonth: benefits.guestPassesPerMonth,
      renewalDate: membership.current_period_end
        ? new Date(membership.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : undefined,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send membership welcome email');
  }
}
