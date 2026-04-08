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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStripeWebhook = handleStripeWebhook;
const stripe_1 = require("../../config/stripe");
const database_1 = require("../../config/database");
const email_service_1 = require("../email/email.service");
const promotion_service_1 = require("../promotions/promotion.service");
const league_service_1 = require("../leagues/league.service");
const membership_service_1 = require("../memberships/membership.service");
const token_utils_1 = require("../../shared/utils/token.utils");
const logger_1 = require("../../shared/utils/logger");
const location_service_1 = require("../locations/location.service");
const stripe_connect_service_1 = require("../business/stripe-connect.service");
function handleStripeWebhook(req, res, socketService) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const sig = req.headers['stripe-signature'];
        if (!stripe_1.webhookSecret) {
            logger_1.logger.error('Stripe webhook secret not found');
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
        const rawBody = req.body;
        const looksLikeConnectEvent = stripe_1.connectWebhookSecret !== null && rawBody.includes(Buffer.from('"account":"acct_'));
        const secretsInPriorityOrder = looksLikeConnectEvent
            ? [stripe_1.connectWebhookSecret, stripe_1.webhookSecret]
            : stripe_1.connectWebhookSecret
                ? [stripe_1.webhookSecret, stripe_1.connectWebhookSecret]
                : [stripe_1.webhookSecret];
        let event = null;
        let lastErr = null;
        for (const secret of secretsInPriorityOrder) {
            try {
                event = stripe_1.stripe.webhooks.constructEvent(rawBody, sig, secret);
                break;
            }
            catch (err) {
                lastErr = err;
            }
        }
        if (!event) {
            logger_1.logger.error({ err: lastErr, triedSecrets: secretsInPriorityOrder.length }, 'Webhook signature verification failed against all configured secrets');
            const msg = lastErr instanceof Error ? lastErr.message : 'unknown';
            return res.status(400).send(`Webhook Error: ${msg}`);
        }
        // Stripe Connect: extract connected account from the event (if present).
        // Stripe.Event.account is set on events forwarded from connected accounts;
        // unset on events from the platform account itself.
        const connectAccount = (_a = event.account) !== null && _a !== void 0 ? _a : undefined;
        const webhookStripeOpts = connectAccount
            ? { stripeAccount: connectAccount }
            : undefined;
        // Handle the event based on type
        switch (event.type) {
            case 'payment_intent.succeeded':
            case 'payment_intent.canceled':
            case 'payment_intent.payment_failed':
                const paymentIntent = event.data.object;
                // --- LEAGUE ENROLLMENT PAYMENT ---
                if (paymentIntent.metadata.type === 'league_enrollment') {
                    const leaguePlayerId = paymentIntent.metadata.league_player_id;
                    const leagueId = paymentIntent.metadata.league_id;
                    if (event.type === 'payment_intent.succeeded') {
                        logger_1.logger.info({ leaguePlayerId, leagueId }, 'League enrollment payment succeeded');
                        try {
                            // Activate the player enrollment
                            const { error: playerError } = yield database_1.supabase
                                .from('league_players')
                                .update({
                                enrollment_status: 'active',
                                season_paid: true,
                                prize_pot_paid: true,
                            })
                                .eq('id', leaguePlayerId);
                            if (playerError) {
                                logger_1.logger.error({ err: playerError, leaguePlayerId }, 'Error activating league player');
                            }
                            else {
                                logger_1.logger.info({ leaguePlayerId }, 'League player activated successfully');
                                // Create league_standings row for the player
                                const { error: standingsError } = yield database_1.supabase
                                    .from('league_standings')
                                    .upsert({
                                    league_id: leagueId,
                                    league_player_id: leaguePlayerId,
                                }, { onConflict: 'league_id,league_player_id' });
                                if (standingsError) {
                                    logger_1.logger.error({ err: standingsError, leaguePlayerId }, 'Error creating standings for league player');
                                }
                                // Insert prize pool contribution into the ledger
                                const prizePotTotal = parseFloat(paymentIntent.metadata.prize_pot_total || '0');
                                if (prizePotTotal > 0) {
                                    try {
                                        const leagueService = new league_service_1.LeagueService();
                                        yield leagueService.insertPrizeContribution(leagueId, leaguePlayerId, prizePotTotal, `Prize pool buy-in ($${prizePotTotal.toFixed(2)})`);
                                        logger_1.logger.info({ prizePotTotal, leaguePlayerId }, 'Inserted prize contribution');
                                    }
                                    catch (ledgerError) {
                                        logger_1.logger.error({ err: ledgerError }, 'Error inserting prize contribution');
                                        // Non-fatal — enrollment is still active
                                    }
                                }
                                // If this is a team enrollment, check if all team members have paid
                                const teamId = paymentIntent.metadata.league_team_id;
                                if (teamId) {
                                    try {
                                        const leagueService = new league_service_1.LeagueService();
                                        const allPaid = yield leagueService.checkTeamAllPaid(teamId);
                                        if (allPaid) {
                                            logger_1.logger.info({ teamId }, 'All team members paid — team is now active');
                                        }
                                    }
                                    catch (teamError) {
                                        logger_1.logger.error({ err: teamError }, 'Error checking team payment status');
                                    }
                                }
                                // Send enrollment confirmation email
                                try {
                                    const { data: player } = yield database_1.supabase
                                        .from('league_players')
                                        .select('user_id, display_name')
                                        .eq('id', leaguePlayerId)
                                        .single();
                                    const { data: league } = yield database_1.supabase
                                        .from('leagues')
                                        .select('name, format, day_of_week, start_time, total_weeks, season_fee, weekly_prize_pot, status, location_id')
                                        .eq('id', leagueId)
                                        .single();
                                    const { data: firstWeek } = yield database_1.supabase
                                        .from('league_weeks')
                                        .select('date')
                                        .eq('league_id', leagueId)
                                        .order('week_number')
                                        .limit(1)
                                        .single();
                                    if (player && league) {
                                        const { data: userProfile } = yield database_1.supabase
                                            .from('user_profiles')
                                            .select('email')
                                            .eq('id', player.user_id)
                                            .single();
                                        if (userProfile === null || userProfile === void 0 ? void 0 : userProfile.email) {
                                            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                            const formatLabels = { stroke_play: 'Individual', team: 'Team' };
                                            const prizePotTotal = parseFloat(paymentIntent.metadata.prize_pot_total || '0');
                                            const totalPaid = (paymentIntent.amount || 0) / 100;
                                            const startDate = (firstWeek === null || firstWeek === void 0 ? void 0 : firstWeek.date)
                                                ? new Date(firstWeek.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                                : 'TBD';
                                            const [h, m] = (league.start_time || '19:00').split(':');
                                            const hour = parseInt(h, 10);
                                            const ampm = hour >= 12 ? 'PM' : 'AM';
                                            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                            const frontendUrl = process.env.FRONTEND_URL || 'https://app.golflabs.us';
                                            email_service_1.EmailService.sendLeagueEnrollmentEmail(league.location_id, {
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
                                }
                                catch (emailError) {
                                    logger_1.logger.error({ err: emailError }, 'Error sending enrollment confirmation email');
                                }
                            }
                        }
                        catch (leagueError) {
                            logger_1.logger.error({ err: leagueError }, 'Error processing league enrollment payment');
                        }
                    }
                    else if (event.type === 'payment_intent.payment_failed') {
                        logger_1.logger.info({ leaguePlayerId, leagueId }, 'League enrollment payment failed');
                        // Mark enrollment as failed
                        yield database_1.supabase
                            .from('league_players')
                            .update({ enrollment_status: 'pending' })
                            .eq('id', leaguePlayerId);
                    }
                    else if (event.type === 'payment_intent.canceled') {
                        logger_1.logger.info({ leaguePlayerId, leagueId }, 'League enrollment payment cancelled');
                        // Remove the pending player record
                        yield database_1.supabase
                            .from('league_players')
                            .delete()
                            .eq('id', leaguePlayerId)
                            .eq('enrollment_status', 'pending');
                    }
                    return res.json({ received: true });
                }
                const bookingId = paymentIntent.metadata.booking_id;
                if (!bookingId) {
                    logger_1.logger.warn({ eventType: event.type }, 'Webhook received with no booking_id in metadata');
                    return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
                }
                if (event.type === 'payment_intent.succeeded') {
                    logger_1.logger.info({ bookingId }, 'Payment succeeded, updating database');
                    // Idempotency: skip if already confirmed (prevents double-processing on Stripe retry)
                    const { data: existingBooking } = yield database_1.supabase
                        .from('bookings')
                        .select('status')
                        .eq('id', bookingId)
                        .single();
                    if ((existingBooking === null || existingBooking === void 0 ? void 0 : existingBooking.status) === 'confirmed') {
                        logger_1.logger.info({ bookingId }, 'Booking already confirmed — idempotent skip');
                        return res.status(200).json({ received: true, message: 'Already processed' });
                    }
                    // Update booking status to 'confirmed' and clear expiration
                    const { error: bookingError } = yield database_1.supabase
                        .from('bookings')
                        .update({ status: 'confirmed', expires_at: null })
                        .eq('id', bookingId);
                    // Update payment status to 'succeeded' and extract card details
                    const paymentUpdate = { status: 'succeeded', processed_at: new Date().toISOString() };
                    // Extract card details from the payment method for display (e.g., extension upsell confirmation)
                    try {
                        if (paymentIntent.payment_method) {
                            const pmId = typeof paymentIntent.payment_method === 'string'
                                ? paymentIntent.payment_method
                                : paymentIntent.payment_method.id;
                            const pm = yield stripe_1.stripe.paymentMethods.retrieve(pmId, webhookStripeOpts);
                            if (pm.card) {
                                paymentUpdate.card_last_four = pm.card.last4;
                                paymentUpdate.card_brand = pm.card.brand;
                                paymentUpdate.payment_method = 'card';
                                logger_1.logger.info({ bookingId, cardBrand: pm.card.brand, cardLast4: pm.card.last4 }, 'Extracted card details');
                            }
                        }
                    }
                    catch (pmError) {
                        logger_1.logger.error({ err: pmError, bookingId }, 'Error retrieving payment method details');
                    }
                    const { error: paymentError } = yield database_1.supabase
                        .from('payments')
                        .update(paymentUpdate)
                        .eq('stripe_payment_intent_id', paymentIntent.id);
                    if (bookingError || paymentError) {
                        logger_1.logger.error({ err: bookingError || paymentError, bookingId }, 'Error updating database after payment');
                        return res.status(500).json({ error: 'Database update failed — Stripe will retry' });
                    }
                    else {
                        logger_1.logger.info({ bookingId }, 'Successfully updated booking to confirmed');
                        // Apply promotion if one was used
                        const promotionId = paymentIntent.metadata.promotion_id;
                        const discountAmount = parseFloat(paymentIntent.metadata.discount_amount || '0');
                        const freeMinutes = parseInt(paymentIntent.metadata.free_minutes || '0', 10);
                        if (promotionId && discountAmount > 0) {
                            try {
                                yield promotion_service_1.promotionService.applyPromotion({
                                    userId: paymentIntent.metadata.user_id,
                                    bookingId: bookingId,
                                    promotionId: promotionId,
                                    discountAmount: discountAmount,
                                    freeMinutes: freeMinutes || undefined
                                });
                                logger_1.logger.info({ promotionId, bookingId, discountAmount }, 'Applied promotion to booking');
                            }
                            catch (promoError) {
                                logger_1.logger.error({ err: promoError, bookingId }, 'Error applying promotion to booking');
                            }
                        }
                        // Deduct membership free minutes if used
                        const membershipIdMeta = paymentIntent.metadata.membership_id;
                        const memberFreeMinutes = parseFloat(paymentIntent.metadata.member_free_minutes_applied || '0');
                        if (membershipIdMeta && memberFreeMinutes > 0) {
                            try {
                                const membershipService = new membership_service_1.MembershipService();
                                const { data: mem } = yield database_1.supabase
                                    .from('memberships')
                                    .select('location_id')
                                    .eq('id', membershipIdMeta)
                                    .single();
                                if (mem) {
                                    const memSettings = yield membershipService.getLocationMembershipSettings(mem.location_id);
                                    if (!memSettings.membershipsEnabled) {
                                        logger_1.logger.info({ membershipId: membershipIdMeta, locationId: mem.location_id }, 'Skipping free minutes deduction — memberships disabled at location');
                                    }
                                    else {
                                        yield database_1.supabase.rpc('increment_free_minutes_used', {
                                            p_membership_id: membershipIdMeta,
                                            p_delta: memberFreeMinutes,
                                        });
                                        yield membershipService.logUsage(membershipIdMeta, bookingId, 'free_minutes', memberFreeMinutes);
                                        logger_1.logger.info({ memberFreeMinutes, membershipId: membershipIdMeta, bookingId }, 'Deducted free minutes from membership');
                                    }
                                }
                            }
                            catch (memberErr) {
                                logger_1.logger.error({ err: memberErr, bookingId }, 'Error deducting membership free minutes');
                            }
                        }
                        // Send thank you email notification
                        try {
                            yield email_service_1.EmailService.sendThankYouEmail(bookingId);
                            logger_1.logger.info({ bookingId }, 'Queued thank you email');
                        }
                        catch (emailError) {
                            logger_1.logger.error({ err: emailError, bookingId }, 'Error queuing thank you email');
                            // Don't fail the webhook if email fails
                        }
                        // Trigger a real-time update for the kiosks at the location
                        try {
                            // We need the location_id and space_id from the booking to know which specific kiosk to notify.
                            const { data: booking, error: fetchError } = yield database_1.supabase
                                .from('bookings')
                                .select('location_id, space_id')
                                .eq('id', bookingId)
                                .single();
                            if (fetchError || !(booking === null || booking === void 0 ? void 0 : booking.location_id) || !(booking === null || booking === void 0 ? void 0 : booking.space_id)) {
                                logger_1.logger.error({ err: fetchError, bookingId }, 'Could not fetch location_id and space_id for kiosk update');
                            }
                            else {
                                logger_1.logger.info({ locationId: booking.location_id, spaceId: booking.space_id }, 'Payment confirmed, triggering kiosk update');
                                yield socketService.triggerBookingUpdate(booking.location_id, booking.space_id, bookingId);
                            }
                        }
                        catch (kioskError) {
                            logger_1.logger.error({ err: kioskError, bookingId }, 'Error triggering kiosk update');
                        }
                        // Check if booking starts within 15 minutes - if so, send reminder immediately
                        try {
                            const { data: bookingDetails, error: bookingFetchError } = yield database_1.supabase
                                .from('bookings')
                                .select('start_time, end_time, location_id')
                                .eq('id', bookingId)
                                .single();
                            if (!bookingFetchError && bookingDetails) {
                                const now = new Date();
                                const bookingStart = new Date(bookingDetails.start_time);
                                const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);
                                logger_1.logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Checked booking start time');
                                if (minutesUntilStart <= 15) {
                                    logger_1.logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Booking starts soon, sending immediate reminder');
                                    const doorLockType = yield location_service_1.LocationService.getDoorLockType(bookingDetails.location_id);
                                    let unlockToken = '';
                                    let unlockLink = '';
                                    if (doorLockType !== 'none') {
                                        unlockToken = (0, token_utils_1.createUnlockToken)(bookingId, bookingDetails.start_time, bookingDetails.end_time);
                                        unlockLink = `${process.env.FRONTEND_URL || 'https://app.golflabs.us'}/unlock?token=${unlockToken}`;
                                        const { error: tokenUpdateError } = yield database_1.supabase
                                            .from('bookings')
                                            .update({
                                            unlock_token: unlockToken,
                                            unlock_token_expires_at: bookingDetails.end_time
                                        })
                                            .eq('id', bookingId);
                                        if (tokenUpdateError) {
                                            logger_1.logger.error({ err: tokenUpdateError, bookingId }, 'Error updating unlock token, skipping reminder');
                                            return;
                                        }
                                    }
                                    yield email_service_1.EmailService.sendReminderEmail(bookingId, unlockToken, unlockLink);
                                    logger_1.logger.info({ bookingId, doorLockType }, 'Sent immediate reminder email');
                                }
                            }
                        }
                        catch (reminderError) {
                            logger_1.logger.error({ err: reminderError, bookingId }, 'Error handling immediate reminder');
                        }
                    }
                }
                else if (event.type === 'payment_intent.canceled') {
                    logger_1.logger.info({ bookingId }, 'Payment canceled, updating database');
                    // Update booking status to 'cancelled'
                    const { error: cancelBookingError } = yield database_1.supabase
                        .from('bookings')
                        .update({ status: 'cancelled' })
                        .eq('id', bookingId)
                        .neq('status', 'confirmed'); // Don't cancel a booking that is already confirmed
                    // Update payment status to 'cancelled'
                    const { error: cancelPaymentError } = yield database_1.supabase
                        .from('payments')
                        .update({ status: 'cancelled' })
                        .eq('stripe_payment_intent_id', paymentIntent.id);
                    if (cancelBookingError || cancelPaymentError) {
                        logger_1.logger.error({ err: cancelBookingError || cancelPaymentError, bookingId }, 'Error updating database after payment cancellation');
                    }
                    else {
                        logger_1.logger.info({ bookingId }, 'Successfully updated booking to cancelled');
                    }
                }
                else if (event.type === 'payment_intent.payment_failed') {
                    logger_1.logger.info({ bookingId }, 'Payment failed');
                    // Update payment record to failed. The booking remains 'reserved' until it expires.
                    const { error: paymentFailedError } = yield database_1.supabase
                        .from('payments')
                        .update({ status: 'failed' })
                        .eq('stripe_payment_intent_id', paymentIntent.id);
                    if (paymentFailedError) {
                        logger_1.logger.error({ err: paymentFailedError, bookingId }, 'Error updating payment status to failed');
                    }
                }
                break;
            // Free booking: SetupIntent succeeded — confirm booking and save payment method
            case 'setup_intent.succeeded': {
                const setupIntent = event.data.object;
                const setupMetadata = setupIntent.metadata || {};
                const setupBookingId = setupMetadata.booking_id;
                if (!setupBookingId) {
                    logger_1.logger.warn({ setupIntentId: setupIntent.id }, 'SetupIntent webhook received with no booking_id in metadata');
                    return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
                }
                logger_1.logger.info({ bookingId: setupBookingId }, 'Setup intent succeeded for free booking, confirming');
                // Update booking status to 'confirmed' and clear expiration
                const { error: setupBookingError } = yield database_1.supabase
                    .from('bookings')
                    .update({ status: 'confirmed', expires_at: null })
                    .eq('id', setupBookingId);
                // Update payment record to 'succeeded' and extract card details
                const setupPaymentUpdate = { status: 'succeeded', processed_at: new Date().toISOString() };
                try {
                    if (setupIntent.payment_method) {
                        const pmId = typeof setupIntent.payment_method === 'string'
                            ? setupIntent.payment_method
                            : setupIntent.payment_method.id;
                        const pm = yield stripe_1.stripe.paymentMethods.retrieve(pmId, webhookStripeOpts);
                        if (pm.card) {
                            setupPaymentUpdate.card_last_four = pm.card.last4;
                            setupPaymentUpdate.card_brand = pm.card.brand;
                            setupPaymentUpdate.payment_method = 'card';
                            logger_1.logger.info({ bookingId: setupBookingId, cardBrand: pm.card.brand, cardLast4: pm.card.last4 }, 'Extracted card details for free booking');
                        }
                    }
                }
                catch (pmError) {
                    logger_1.logger.error({ err: pmError, bookingId: setupBookingId }, 'Error retrieving payment method for free booking');
                }
                const { error: setupPaymentError } = yield database_1.supabase
                    .from('payments')
                    .update(setupPaymentUpdate)
                    .eq('stripe_payment_intent_id', setupIntent.id);
                if (setupBookingError || setupPaymentError) {
                    logger_1.logger.error({ err: setupBookingError || setupPaymentError, bookingId: setupBookingId }, 'Error updating database after setup for free booking');
                }
                else {
                    logger_1.logger.info({ bookingId: setupBookingId }, 'Successfully confirmed free booking');
                    // Apply promotion if one was used
                    const setupPromotionId = setupMetadata.promotion_id;
                    const setupDiscountAmount = parseFloat(setupMetadata.discount_amount || '0');
                    const setupFreeMinutes = parseInt(setupMetadata.free_minutes || '0', 10);
                    if (setupPromotionId && setupDiscountAmount > 0) {
                        try {
                            yield promotion_service_1.promotionService.applyPromotion({
                                userId: setupMetadata.user_id,
                                bookingId: setupBookingId,
                                promotionId: setupPromotionId,
                                discountAmount: setupDiscountAmount,
                                freeMinutes: setupFreeMinutes || undefined
                            });
                            logger_1.logger.info({ promotionId: setupPromotionId, bookingId: setupBookingId }, 'Applied promotion to free booking');
                        }
                        catch (promoError) {
                            logger_1.logger.error({ err: promoError, bookingId: setupBookingId }, 'Error applying promotion to free booking');
                        }
                    }
                    // Deduct membership free minutes if used (free booking covered entirely by member hours)
                    const setupMembershipId = setupMetadata.membership_id;
                    const setupMemberFreeMinutes = parseFloat(setupMetadata.member_free_minutes_applied || '0');
                    if (setupMembershipId && setupMemberFreeMinutes > 0) {
                        try {
                            const membershipService = new membership_service_1.MembershipService();
                            const { data: mem } = yield database_1.supabase
                                .from('memberships')
                                .select('location_id')
                                .eq('id', setupMembershipId)
                                .single();
                            if (mem) {
                                const memSettings = yield membershipService.getLocationMembershipSettings(mem.location_id);
                                if (!memSettings.membershipsEnabled) {
                                    logger_1.logger.info({ membershipId: setupMembershipId, locationId: mem.location_id }, 'Skipping free minutes deduction — memberships disabled at location');
                                }
                                else {
                                    yield database_1.supabase.rpc('increment_free_minutes_used', {
                                        p_membership_id: setupMembershipId,
                                        p_delta: setupMemberFreeMinutes,
                                    });
                                    yield membershipService.logUsage(setupMembershipId, setupBookingId, 'free_minutes', setupMemberFreeMinutes);
                                    logger_1.logger.info({ memberFreeMinutes: setupMemberFreeMinutes, membershipId: setupMembershipId, bookingId: setupBookingId }, 'Deducted free minutes from membership for free booking');
                                }
                            }
                        }
                        catch (memberErr) {
                            logger_1.logger.error({ err: memberErr, bookingId: setupBookingId }, 'Error deducting membership free minutes for free booking');
                        }
                    }
                    // Send thank you email
                    try {
                        yield email_service_1.EmailService.sendThankYouEmail(setupBookingId);
                        logger_1.logger.info({ bookingId: setupBookingId }, 'Queued thank you email for free booking');
                    }
                    catch (emailError) {
                        logger_1.logger.error({ err: emailError, bookingId: setupBookingId }, 'Error queuing thank you email for free booking');
                    }
                    // Trigger kiosk update
                    try {
                        const { data: setupBooking, error: setupFetchError } = yield database_1.supabase
                            .from('bookings')
                            .select('location_id, space_id')
                            .eq('id', setupBookingId)
                            .single();
                        if (!setupFetchError && (setupBooking === null || setupBooking === void 0 ? void 0 : setupBooking.location_id) && (setupBooking === null || setupBooking === void 0 ? void 0 : setupBooking.space_id)) {
                            logger_1.logger.info({ locationId: setupBooking.location_id, spaceId: setupBooking.space_id }, 'Free booking confirmed, triggering kiosk update');
                            yield socketService.triggerBookingUpdate(setupBooking.location_id, setupBooking.space_id, setupBookingId);
                        }
                    }
                    catch (kioskError) {
                        logger_1.logger.error({ err: kioskError, bookingId: setupBookingId }, 'Error triggering kiosk update for free booking');
                    }
                    // Check if booking starts within 15 minutes — send reminder immediately
                    try {
                        const { data: setupBookingDetails, error: setupBookingFetchError } = yield database_1.supabase
                            .from('bookings')
                            .select('start_time, end_time, location_id')
                            .eq('id', setupBookingId)
                            .single();
                        if (!setupBookingFetchError && setupBookingDetails) {
                            const now = new Date();
                            const bookingStart = new Date(setupBookingDetails.start_time);
                            const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);
                            if (minutesUntilStart <= 15) {
                                logger_1.logger.info({ bookingId: setupBookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Free booking starts soon, sending immediate reminder');
                                const doorLockType = yield location_service_1.LocationService.getDoorLockType(setupBookingDetails.location_id);
                                let unlockToken = '';
                                let unlockLink = '';
                                if (doorLockType !== 'none') {
                                    unlockToken = (0, token_utils_1.createUnlockToken)(setupBookingId, setupBookingDetails.start_time, setupBookingDetails.end_time);
                                    unlockLink = `${process.env.FRONTEND_URL || 'https://app.golflabs.us'}/unlock?token=${unlockToken}`;
                                    yield database_1.supabase
                                        .from('bookings')
                                        .update({
                                        unlock_token: unlockToken,
                                        unlock_token_expires_at: setupBookingDetails.end_time
                                    })
                                        .eq('id', setupBookingId);
                                }
                                yield email_service_1.EmailService.sendReminderEmail(setupBookingId, unlockToken, unlockLink);
                                logger_1.logger.info({ bookingId: setupBookingId, doorLockType }, 'Sent immediate reminder email for free booking');
                            }
                        }
                    }
                    catch (reminderError) {
                        logger_1.logger.error({ err: reminderError, bookingId: setupBookingId }, 'Error handling immediate reminder for free booking');
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
                const subscription = event.data.object;
                const subMeta = subscription.metadata || {};
                const subUserId = subMeta.user_id;
                const subPlanId = subMeta.plan_id;
                const subLocationId = subMeta.location_id;
                if (!subUserId) {
                    logger_1.logger.warn({ eventType: event.type }, 'Subscription webhook has no user_id metadata, ignoring');
                    return res.json({ received: true });
                }
                // Map Stripe subscription status to our status
                let membershipStatus = subscription.status;
                if (subscription.status === 'active' && subscription.cancel_at_period_end) {
                    membershipStatus = 'active'; // still active until period ends
                }
                const safeTimestamp = (ts) => {
                    if (!ts || typeof ts !== 'number')
                        return null;
                    const d = new Date(ts * 1000);
                    return isNaN(d.getTime()) ? null : d.toISOString();
                };
                if (event.type === 'customer.subscription.created') {
                    logger_1.logger.info({ userId: subUserId, planId: subPlanId }, 'Subscription created');
                    // Check if membership row already exists (pre-created) or needs to be created (Checkout Session flow)
                    const { data: existingMem } = yield database_1.supabase
                        .from('memberships')
                        .select('id')
                        .eq('stripe_subscription_id', subscription.id)
                        .maybeSingle();
                    const periodStart = safeTimestamp(subscription.current_period_start);
                    const periodEnd = safeTimestamp(subscription.current_period_end);
                    const billingInterval = subMeta.billing_interval || 'monthly';
                    if (!existingMem && subPlanId && subLocationId) {
                        // Created via Stripe Checkout — insert the membership row
                        const { error: insertErr } = yield database_1.supabase
                            .from('memberships')
                            .insert({
                            user_id: subUserId,
                            plan_id: subPlanId,
                            location_id: subLocationId,
                            stripe_subscription_id: subscription.id,
                            status: subscription.status === 'active' ? 'active' : 'incomplete',
                            billing_interval: billingInterval,
                            current_period_start: periodStart,
                            current_period_end: periodEnd,
                        });
                        if (insertErr) {
                            logger_1.logger.error({ err: insertErr, subscriptionId: subscription.id }, 'Error creating membership from webhook');
                        }
                        else {
                            logger_1.logger.info({ userId: subUserId, subscriptionId: subscription.id }, 'Membership created from Checkout Session webhook');
                            if (subscription.status === 'active') {
                                sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
                            }
                        }
                    }
                    else if (existingMem && subscription.status === 'active') {
                        // Pre-created row exists — just update status
                        const updateFields = { status: 'active' };
                        if (periodStart)
                            updateFields.current_period_start = periodStart;
                        if (periodEnd)
                            updateFields.current_period_end = periodEnd;
                        yield database_1.supabase
                            .from('memberships')
                            .update(updateFields)
                            .eq('stripe_subscription_id', subscription.id);
                        sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
                    }
                }
                else if (event.type === 'customer.subscription.updated') {
                    logger_1.logger.info({ userId: subUserId, status: subscription.status }, 'Subscription updated');
                    const previousAttributes = event.data.previous_attributes;
                    const wasIncomplete = (previousAttributes === null || previousAttributes === void 0 ? void 0 : previousAttributes.status) && previousAttributes.status !== 'active' && subscription.status === 'active';
                    const updateData = {
                        status: membershipStatus,
                    };
                    const periodStart = safeTimestamp(subscription.current_period_start);
                    const periodEnd = safeTimestamp(subscription.current_period_end);
                    if (periodStart)
                        updateData.current_period_start = periodStart;
                    if (periodEnd)
                        updateData.current_period_end = periodEnd;
                    if (subPlanId) {
                        updateData.plan_id = subPlanId;
                    }
                    if (subscription.cancel_at_period_end) {
                        updateData.canceled_at = new Date().toISOString();
                    }
                    else {
                        updateData.canceled_at = null;
                    }
                    yield database_1.supabase
                        .from('memberships')
                        .update(updateData)
                        .eq('stripe_subscription_id', subscription.id);
                    // Send welcome email when transitioning to active (e.g. from incomplete)
                    if (wasIncomplete) {
                        sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
                    }
                }
                else if (event.type === 'customer.subscription.deleted') {
                    logger_1.logger.info({ userId: subUserId }, 'Subscription deleted');
                    yield database_1.supabase
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
                const paidInvoice = event.data.object;
                const invoiceSubId = paidInvoice.subscription;
                if (invoiceSubId && paidInvoice.billing_reason === 'subscription_cycle') {
                    // Only reset usage on actual renewals, not the initial subscription invoice
                    logger_1.logger.info({ subscriptionId: invoiceSubId }, 'Subscription renewal invoice paid, resetting usage counters');
                    const { error: resetErr } = yield database_1.supabase
                        .from('memberships')
                        .update({
                        status: 'active',
                        free_minutes_used: 0,
                        guest_passes_used: 0,
                    })
                        .eq('stripe_subscription_id', invoiceSubId);
                    if (resetErr) {
                        logger_1.logger.error({ err: resetErr, subscriptionId: invoiceSubId }, 'Error resetting usage for subscription');
                    }
                }
                else if (invoiceSubId) {
                    // First invoice or other billing reason — just ensure active status
                    logger_1.logger.info({ subscriptionId: invoiceSubId, billingReason: paidInvoice.billing_reason }, 'Invoice paid for subscription');
                    yield database_1.supabase
                        .from('memberships')
                        .update({ status: 'active' })
                        .eq('stripe_subscription_id', invoiceSubId);
                }
                return res.json({ received: true });
            }
            case 'invoice.payment_failed': {
                const failedInvoice = event.data.object;
                const failedSubId = failedInvoice.subscription;
                if (failedSubId) {
                    logger_1.logger.info({ subscriptionId: failedSubId }, 'Invoice payment failed');
                    yield database_1.supabase
                        .from('memberships')
                        .update({ status: 'past_due' })
                        .eq('stripe_subscription_id', failedSubId);
                }
                return res.json({ received: true });
            }
            // Stripe Connect: connected account capability changed
            // (e.g. owner finished onboarding, charges_enabled flipped to true)
            case 'account.updated': {
                const account = event.data.object;
                try {
                    yield stripe_connect_service_1.stripeConnectService.syncAccountStatus(account.id);
                    logger_1.logger.info({ accountId: account.id, chargesEnabled: account.charges_enabled }, 'Synced Stripe Connect account status');
                }
                catch (err) {
                    logger_1.logger.error({ err, accountId: account.id }, 'Failed to sync account.updated event');
                }
                return res.json({ received: true });
            }
            // Refund webhook handlers
            case 'charge.dispute.created':
                const dispute = event.data.object;
                const chargeId = dispute.charge;
                logger_1.logger.info({ chargeId }, 'Dispute created, handling dispute');
                // Find the payment record by charge ID (you may need to store charge_id in payments table)
                // For now, we'll log this and handle manually
                logger_1.logger.warn({ chargeId }, 'Dispute created, manual review required');
                break;
            default:
                // Handle refund events that may not be in the main Stripe.Event type
                if (event.type.startsWith('refund.')) {
                    const refundEvent = event; // Type assertion for refund events
                    const refund = refundEvent.data.object;
                    const refundBookingId = (_b = refund.metadata) === null || _b === void 0 ? void 0 : _b.booking_id;
                    const refundLeaguePlayerId = (_c = refund.metadata) === null || _c === void 0 ? void 0 : _c.league_player_id;
                    const refundLeagueId = (_d = refund.metadata) === null || _d === void 0 ? void 0 : _d.league_id;
                    // League enrollment refund
                    if (refundLeaguePlayerId && refundLeagueId) {
                        if (event.type === 'refund.created') {
                            logger_1.logger.info({ leaguePlayerId: refundLeaguePlayerId, leagueId: refundLeagueId, refundId: refund.id }, 'League refund created');
                            const { error: leagueRefundError } = yield database_1.supabase
                                .from('league_players')
                                .update({
                                season_paid: false,
                                prize_pot_paid: false,
                                enrollment_status: 'withdrawn',
                            })
                                .eq('id', refundLeaguePlayerId);
                            if (leagueRefundError) {
                                logger_1.logger.error({ err: leagueRefundError, leaguePlayerId: refundLeaguePlayerId }, 'Error updating league player on refund');
                            }
                            else {
                                logger_1.logger.info({ leaguePlayerId: refundLeaguePlayerId }, 'League player marked as withdrawn (refund created)');
                            }
                        }
                        else if (event.type === 'refund.updated') {
                            logger_1.logger.info({ leaguePlayerId: refundLeaguePlayerId, refundStatus: refund.status }, 'League refund updated');
                            if (refund.status === 'succeeded') {
                                const { error } = yield database_1.supabase
                                    .from('league_players')
                                    .update({ enrollment_status: 'withdrawn', season_paid: false, prize_pot_paid: false })
                                    .eq('id', refundLeaguePlayerId);
                                if (error) {
                                    logger_1.logger.error({ err: error, leaguePlayerId: refundLeaguePlayerId }, 'Error finalizing league refund');
                                }
                                else {
                                    logger_1.logger.info({ leaguePlayerId: refundLeaguePlayerId }, 'League refund succeeded, status: withdrawn');
                                }
                            }
                            else if (refund.status === 'failed') {
                                logger_1.logger.error({ leaguePlayerId: refundLeaguePlayerId }, 'League refund FAILED, manual review required');
                            }
                        }
                        break;
                    }
                    // Booking refund
                    if (!refundBookingId) {
                        logger_1.logger.warn({ refundId: refund.id, eventType: event.type }, 'Refund webhook received with no booking_id or league_player_id in metadata');
                        break;
                    }
                    if (event.type === 'refund.created') {
                        logger_1.logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund created for booking');
                        const { error: refundCreateError } = yield database_1.supabase
                            .from('payments')
                            .update({
                            status: 'refunding',
                            refund_amount: refund.amount / 100,
                            refunded_at: new Date().toISOString()
                        })
                            .eq('booking_id', refundBookingId);
                        if (refundCreateError) {
                            logger_1.logger.error({ err: refundCreateError, bookingId: refundBookingId }, 'Error updating payment with refund info');
                        }
                        else {
                            logger_1.logger.info({ bookingId: refundBookingId }, 'Successfully updated payment record with refund info');
                        }
                    }
                    else if (event.type === 'refund.updated') {
                        logger_1.logger.info({ bookingId: refundBookingId, refundStatus: refund.status }, 'Refund updated for booking');
                        let paymentStatus = 'refunding';
                        if (refund.status === 'succeeded') {
                            paymentStatus = 'refunded';
                        }
                        else if (refund.status === 'failed') {
                            paymentStatus = 'refund_failed';
                        }
                        const { error: refundUpdateError } = yield database_1.supabase
                            .from('payments')
                            .update({
                            status: paymentStatus,
                            refund_amount: refund.amount / 100,
                            refunded_at: refund.status === 'succeeded' ? new Date().toISOString() : undefined
                        })
                            .eq('booking_id', refundBookingId);
                        if (refundUpdateError) {
                            logger_1.logger.error({ err: refundUpdateError, bookingId: refundBookingId }, 'Error updating payment refund status');
                        }
                        else {
                            logger_1.logger.info({ paymentStatus, bookingId: refundBookingId }, 'Successfully updated payment refund status');
                        }
                    }
                    else if (event.type.includes('refund') && event.type.includes('failed')) {
                        logger_1.logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund failed for booking');
                        const { error: refundFailedError } = yield database_1.supabase
                            .from('payments')
                            .update({
                            status: 'refund_failed'
                        })
                            .eq('booking_id', refundBookingId);
                        const { error: cancellationUpdateError } = yield database_1.supabase
                            .from('booking_cancellations')
                            .update({
                            cancellation_reason: `Refund failed: ${refund.failure_reason || 'Unknown reason'}. Manual processing required.`
                        })
                            .eq('booking_id', refundBookingId);
                        if (refundFailedError || cancellationUpdateError) {
                            logger_1.logger.error({ err: refundFailedError || cancellationUpdateError, bookingId: refundBookingId }, 'Error updating records for failed refund');
                        }
                        else {
                            logger_1.logger.info({ bookingId: refundBookingId }, 'Updated records for failed refund');
                        }
                    }
                }
                else {
                    logger_1.logger.info({ eventType: event.type }, 'Unhandled event type');
                }
                break;
        }
        res.json({ received: true });
    });
}
function sendMembershipWelcomeEmailFromWebhook(subscription, userId, planId, locationId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!planId || !locationId)
                return;
            const { data: membership } = yield database_1.supabase
                .from('memberships')
                .select('*, membership_plans(*)')
                .eq('stripe_subscription_id', subscription.id)
                .single();
            if (!membership)
                return;
            const { data: profile } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', userId)
                .single();
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('name')
                .eq('id', locationId)
                .single();
            if (!(profile === null || profile === void 0 ? void 0 : profile.email) || !location)
                return;
            const plan = membership.membership_plans;
            const benefits = plan.benefits || {};
            yield email_service_1.EmailService.sendMembershipWelcomeEmail(locationId, {
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
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Failed to send membership welcome email');
        }
    });
}
