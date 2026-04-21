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
exports.PaymentService = void 0;
const stripe_1 = require("../../config/stripe");
const database_1 = require("../../config/database");
const promotion_service_1 = require("../promotions/promotion.service");
const membership_service_1 = require("../memberships/membership.service");
const logger_1 = require("../../shared/utils/logger");
const pricing_utils_1 = require("../../shared/utils/pricing.utils");
class PaymentService {
    /**
     * Update the booking record with server-computed promotion info.
     */
    updateBookingPromotion(bookingId, promotionId, originalSubtotal, serverDiscountAmount, subtotal) {
        return __awaiter(this, void 0, void 0, function* () {
            if (promotionId && serverDiscountAmount > 0) {
                yield database_1.supabase.from('bookings').update({
                    original_amount: originalSubtotal / 100,
                    discount_amount: serverDiscountAmount / 100,
                    promotion_id: promotionId,
                    total_amount: subtotal / 100,
                }).eq('id', bookingId);
            }
            else {
                yield database_1.supabase.from('bookings').update({
                    original_amount: null,
                    discount_amount: 0,
                    promotion_id: null,
                    total_amount: originalSubtotal / 100,
                }).eq('id', bookingId);
            }
        });
    }
    createPaymentIntent(bookingId, authenticatedUserId, promotionInfo, memberPricingInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            if (!bookingId) {
                throw new Error('Booking ID is required');
            }
            // 1. Verify the booking is valid for payment
            const { data: booking, error: fetchError } = yield database_1.supabase
                .from('bookings')
                .select('id, status, expires_at, user_id, space_id, location_id, created_at, total_amount, start_time, end_time')
                .eq('id', bookingId)
                .single();
            if (fetchError || !booking) {
                logger_1.logger.error({ bookingId, err: fetchError }, 'Booking not found');
                throw new Error('Booking not found.');
            }
            // Verify the authenticated user owns this booking
            if (booking.user_id !== authenticatedUserId) {
                logger_1.logger.warn({ bookingId, bookingUserId: booking.user_id, authenticatedUserId }, 'User attempted to pay for another user\'s booking');
                throw new Error('Booking not found.');
            }
            logger_1.logger.info({ bookingId, status: booking.status, expiresAt: booking.expires_at, createdAt: booking.created_at, userId: booking.user_id }, 'Payment intent requested for booking');
            if (booking.status !== 'reserved' && booking.status !== 'pending') {
                logger_1.logger.error({ bookingId, status: booking.status }, 'Booking has invalid status for payment');
                throw new Error(`Booking cannot be paid for. Status: ${booking.status}`);
            }
            // Check expiration using UTC timestamp comparison (only for reserved bookings with an expiry)
            if (booking.status === 'reserved' && booking.expires_at) {
                const now = new Date().toISOString();
                if (booking.expires_at < now) {
                    // The reservation has expired, update its status
                    yield database_1.supabase
                        .from('bookings')
                        .update({ status: 'expired' })
                        .eq('id', bookingId)
                        .eq('status', 'reserved');
                    throw new Error('Booking reservation has expired.');
                }
            }
            // 1b. Re-check slot availability to prevent double-booking (client check is bypassable)
            const now = new Date().toISOString();
            const { data: conflicts } = yield database_1.supabase
                .from('bookings')
                .select('id, status, expires_at')
                .eq('space_id', booking.space_id)
                .eq('location_id', booking.location_id)
                .lt('start_time', booking.end_time)
                .gt('end_time', booking.start_time)
                .in('status', ['confirmed', 'reserved'])
                .neq('id', bookingId);
            if (conflicts && conflicts.length > 0) {
                const activeConflicts = conflicts.filter(c => {
                    if (c.status === 'reserved' && c.expires_at && c.expires_at < now)
                        return false;
                    return true;
                });
                if (activeConflicts.length > 0) {
                    logger_1.logger.warn({ bookingId, activeConflicts: activeConflicts.map(c => c.id) }, 'Slot conflict detected before payment');
                    throw new Error('This time slot is no longer available');
                }
            }
            // 1c. Compute the price server-side (never trust client amount)
            const priceResult = yield this.calculatePrice(booking.location_id, booking.start_time, booking.end_time, booking.user_id);
            let subtotal = priceResult.total; // in cents, includes membership discounts
            const originalSubtotal = subtotal;
            // 1d. If a promotion is claimed, validate and apply it server-side
            let serverDiscountAmount = 0;
            if (promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.promotionId) {
                try {
                    // First check if user has this promo pre-assigned (first-booking flow).
                    // `!inner` + `.eq('promotions.location_id', booking.location_id)` pushes
                    // the tenant check to the DB — a client can't redeem another tenant's
                    // promo by forging the promotionId.
                    const { data: userPromo } = yield database_1.supabase
                        .from('user_promotions')
                        .select('id, promotion_id, redeemed_at, promotions!inner(*)')
                        .eq('user_id', booking.user_id)
                        .eq('promotion_id', promotionInfo.promotionId)
                        .eq('promotions.location_id', booking.location_id)
                        .is('redeemed_at', null)
                        .maybeSingle();
                    let promo = null;
                    if (userPromo === null || userPromo === void 0 ? void 0 : userPromo.promotions) {
                        // Promotion was pre-assigned to the user (e.g. first-booking promo)
                        promo = userPromo.promotions;
                    }
                    else {
                        // Promotion applied via code at checkout — look up directly and
                        // verify it's active AND belongs to this booking's location.
                        const { data: directPromo } = yield database_1.supabase
                            .from('promotions')
                            .select('*')
                            .eq('id', promotionInfo.promotionId)
                            .eq('location_id', booking.location_id)
                            .eq('is_active', true)
                            .single();
                        if (directPromo) {
                            // Enforce is_single_use: check if user already used this promo
                            if (directPromo.is_single_use) {
                                const alreadyUsed = yield promotion_service_1.promotionService.hasUserUsedPromotion(booking.user_id, directPromo.id);
                                if (alreadyUsed) {
                                    logger_1.logger.warn({ bookingId, promotionId: directPromo.id, userId: booking.user_id }, 'Single-use promotion already used by this user');
                                }
                                else {
                                    promo = directPromo;
                                }
                            }
                            else {
                                promo = directPromo;
                            }
                        }
                        else {
                            logger_1.logger.warn({ bookingId, promotionId: promotionInfo.promotionId }, 'Promotion not found or not active');
                        }
                    }
                    if (promo) {
                        if (promo.discount_type === 'percentage') {
                            serverDiscountAmount = Math.round(subtotal * (promo.discount_value / 100));
                        }
                        else if (promo.discount_type === 'fixed') {
                            serverDiscountAmount = Math.min(Math.round(promo.discount_value * 100), subtotal);
                        }
                        else if (promo.discount_type === 'free_minutes') {
                            const totalMinutes = (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 60000;
                            const freeMinutes = Math.min(promo.discount_value, totalMinutes);
                            const freeSlots = Math.floor(freeMinutes / 15);
                            const totalSlots = totalMinutes / 15;
                            if (totalSlots > 0) {
                                serverDiscountAmount = Math.round((freeSlots / totalSlots) * subtotal);
                            }
                        }
                        subtotal = Math.max(0, subtotal - serverDiscountAmount);
                        logger_1.logger.info({ bookingId, promotionId: promotionInfo.promotionId, discountType: promo.discount_type, serverDiscountAmount, subtotalAfterDiscount: subtotal }, 'Server-applied promotion discount');
                    }
                }
                catch (promoErr) {
                    logger_1.logger.error({ err: promoErr, promotionId: promotionInfo.promotionId }, 'Error validating promotion server-side');
                    // Continue without discount — charge full price rather than fail
                }
            }
            // 1e. Apply sales tax
            const { data: locationData } = yield database_1.supabase
                .from('locations')
                .select('sales_tax_rate')
                .eq('id', booking.location_id)
                .single();
            const taxRate = parseFloat(locationData === null || locationData === void 0 ? void 0 : locationData.sales_tax_rate) || 0;
            const taxAmount = Math.round(subtotal * taxRate);
            let amount = subtotal + taxAmount;
            logger_1.logger.info({ bookingId, originalSubtotal, serverDiscountAmount, subtotal, taxRate, taxAmount, finalAmount: amount }, 'Server-computed payment amount');
            // 2. Resolve Stripe Connect options for this location
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(booking.location_id);
            // 3. Check if a payment intent already exists for this booking
            const { data: existingPayment, error: paymentCheckError } = yield database_1.supabase
                .from('payments')
                .select('stripe_payment_intent_id, status')
                .eq('booking_id', bookingId)
                .in('status', ['pending', 'processing'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (paymentCheckError && paymentCheckError.code !== 'PGRST116') {
                logger_1.logger.error({ err: paymentCheckError }, 'Error checking existing payments');
                throw paymentCheckError;
            }
            // If we found an existing pending/processing payment, try to reuse or update it
            if (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.stripe_payment_intent_id) {
                const existingId = existingPayment.stripe_payment_intent_id;
                const isSetupIntent = existingId.startsWith('seti_');
                try {
                    if (isSetupIntent) {
                        const existingSetupIntent = yield stripe_1.stripe.setupIntents.retrieve(existingId, stripeOpts);
                        if (amount > 0) {
                            // Was free, now has a cost (promo removed or changed) — cancel setup intent and create payment intent
                            logger_1.logger.info({ setupIntentId: existingSetupIntent.id, bookingId }, 'Amount changed from free to paid, cancelling setup intent');
                            yield stripe_1.stripe.setupIntents.cancel(existingSetupIntent.id, stripeOpts);
                        }
                        else if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existingSetupIntent.status)) {
                            logger_1.logger.info({ setupIntentId: existingSetupIntent.id, bookingId }, 'Reusing existing setup intent');
                            return { clientSecret: existingSetupIntent.client_secret, bookingId: booking.id, type: 'setup', stripeAccountId: (_a = stripeOpts === null || stripeOpts === void 0 ? void 0 : stripeOpts.stripeAccount) !== null && _a !== void 0 ? _a : null };
                        }
                    }
                    else {
                        const existingPaymentIntent = yield stripe_1.stripe.paymentIntents.retrieve(existingId, stripeOpts);
                        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existingPaymentIntent.status)) {
                            // If the amount changed (e.g. promo applied/removed), update the existing intent
                            if (existingPaymentIntent.amount !== amount) {
                                logger_1.logger.info({ paymentIntentId: existingPaymentIntent.id, oldAmount: existingPaymentIntent.amount, newAmount: amount, bookingId }, 'Updating existing payment intent with new amount');
                                const updated = yield stripe_1.stripe.paymentIntents.update(existingPaymentIntent.id, {
                                    amount,
                                    metadata: Object.assign(Object.assign({}, existingPaymentIntent.metadata), { promotion_id: (promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.promotionId) || '', discount_amount: (serverDiscountAmount / 100).toString(), original_amount: (originalSubtotal / 100).toString() }),
                                }, stripeOpts);
                                // Update local payment record and booking
                                yield database_1.supabase.from('payments').update({ amount: amount / 100 }).eq('stripe_payment_intent_id', existingId);
                                yield this.updateBookingPromotion(bookingId, promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.promotionId, originalSubtotal, serverDiscountAmount, subtotal);
                                return { clientSecret: updated.client_secret, bookingId: booking.id, type: 'payment', stripeAccountId: (_b = stripeOpts === null || stripeOpts === void 0 ? void 0 : stripeOpts.stripeAccount) !== null && _b !== void 0 ? _b : null };
                            }
                            logger_1.logger.info({ paymentIntentId: existingPaymentIntent.id, bookingId }, 'Reusing existing payment intent (same amount)');
                            return { clientSecret: existingPaymentIntent.client_secret, bookingId: booking.id, type: 'payment', stripeAccountId: (_c = stripeOpts === null || stripeOpts === void 0 ? void 0 : stripeOpts.stripeAccount) !== null && _c !== void 0 ? _c : null };
                        }
                        else if (existingPaymentIntent.status === 'processing') {
                            logger_1.logger.info({ paymentIntentId: existingPaymentIntent.id, bookingId }, 'Existing payment intent is processing, returning as-is');
                            return { clientSecret: existingPaymentIntent.client_secret, bookingId: booking.id, type: 'payment', stripeAccountId: (_d = stripeOpts === null || stripeOpts === void 0 ? void 0 : stripeOpts.stripeAccount) !== null && _d !== void 0 ? _d : null };
                        }
                        else {
                            logger_1.logger.info({ paymentIntentId: existingPaymentIntent.id, status: existingPaymentIntent.status }, 'Existing payment intent has non-reusable status, creating new one');
                        }
                    }
                }
                catch (stripeError) {
                    logger_1.logger.error({ err: stripeError }, 'Error retrieving existing Stripe intent');
                }
            }
            // 4. Ensure user has a Stripe Customer scoped to the correct account
            let stripeCustomerId = null;
            try {
                const { customerId } = yield (0, stripe_1.getOrCreateCustomerForLocation)(booking.user_id, booking.location_id);
                stripeCustomerId = customerId;
                logger_1.logger.info({ stripeCustomerId, userId: booking.user_id }, 'Resolved Stripe customer for location');
            }
            catch (customerError) {
                logger_1.logger.error({ userId: booking.user_id, err: customerError }, 'Error setting up Stripe customer');
                // Continue without customer - payment will still work, just won't save card
            }
            // 4. Update booking with server-computed pricing info
            yield this.updateBookingPromotion(bookingId, promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.promotionId, originalSubtotal, serverDiscountAmount, subtotal);
            const intentMetadata = {
                booking_id: booking.id,
                user_id: booking.user_id,
                space_id: booking.space_id,
                location_id: booking.location_id,
                promotion_id: (promotionInfo === null || promotionInfo === void 0 ? void 0 : promotionInfo.promotionId) || '',
                discount_amount: (serverDiscountAmount / 100).toString(),
                original_amount: (originalSubtotal / 100).toString(),
            };
            if (memberPricingInfo === null || memberPricingInfo === void 0 ? void 0 : memberPricingInfo.membershipId) {
                intentMetadata.membership_id = memberPricingInfo.membershipId;
                intentMetadata.member_free_minutes_applied = memberPricingInfo.freeMinutesApplied.toString();
            }
            // 6. Free booking (amount = 0): create SetupIntent to save card for future charges
            if (amount === 0) {
                if (!stripeCustomerId) {
                    throw new Error('A Stripe customer is required for free bookings to save payment method.');
                }
                const setupIntent = yield stripe_1.stripe.setupIntents.create({
                    customer: stripeCustomerId,
                    payment_method_types: ['card'],
                    metadata: intentMetadata,
                    usage: 'off_session',
                }, stripeOpts);
                // Create a $0 payment record linked to the setup intent
                const { error: paymentError } = yield database_1.supabase
                    .from('payments')
                    .insert({
                    booking_id: booking.id,
                    amount: 0,
                    status: 'pending',
                    stripe_payment_intent_id: setupIntent.id,
                    currency: 'usd',
                    user_id: booking.user_id,
                    location_id: booking.location_id
                });
                if (paymentError) {
                    yield stripe_1.stripe.setupIntents.cancel(setupIntent.id, stripeOpts);
                    logger_1.logger.error({ err: paymentError }, 'Error creating payment record for free booking, cancelling setup intent');
                    throw paymentError;
                }
                logger_1.logger.info({ setupIntentId: setupIntent.id, bookingId, discountAmount: serverDiscountAmount / 100 }, 'Created setup intent for free booking');
                return {
                    clientSecret: setupIntent.client_secret,
                    bookingId: booking.id,
                    type: 'setup',
                    stripeAccountId: (_e = stripeOpts === null || stripeOpts === void 0 ? void 0 : stripeOpts.stripeAccount) !== null && _e !== void 0 ? _e : null,
                };
            }
            // 7. Paid booking: create Stripe Payment Intent with MANUAL capture.
            // capture_method='manual' authorizes the card (holds funds) without
            // charging. The webhook's amount_capturable_updated handler does a
            // final availability check at capture time — if the booking is still
            // valid, it captures; if not, it cancels the auth so the customer is
            // never charged. This is the industry-standard pattern for preventing
            // "charge then refund" when a slot is claimed between PI creation and
            // payment confirmation.
            const paymentIntentParams = {
                amount,
                currency: 'usd',
                capture_method: 'manual',
                automatic_payment_methods: { enabled: true },
                metadata: intentMetadata
            };
            // Attach Stripe Customer and save card for future off-session charges (extensions)
            if (stripeCustomerId) {
                paymentIntentParams.customer = stripeCustomerId;
                paymentIntentParams.setup_future_usage = 'off_session';
            }
            const paymentIntent = yield stripe_1.stripe.paymentIntents.create(paymentIntentParams, stripeOpts);
            // 7. Create a corresponding payment record
            const { error: paymentError } = yield database_1.supabase
                .from('payments')
                .insert({
                booking_id: booking.id,
                amount: amount / 100,
                status: 'pending',
                stripe_payment_intent_id: paymentIntent.id,
                currency: 'usd',
                user_id: booking.user_id,
                location_id: booking.location_id
            });
            if (paymentError) {
                yield stripe_1.stripe.paymentIntents.cancel(paymentIntent.id, stripeOpts);
                logger_1.logger.error({ err: paymentError }, 'Error creating payment record, cancelling payment intent');
                throw paymentError;
            }
            logger_1.logger.info({ paymentIntentId: paymentIntent.id, bookingId, amount: amount / 100, discountAmount: serverDiscountAmount / 100 }, 'Created new payment intent');
            // 8. Send the client secret + the connected-account id back to the
            //    frontend so Stripe Elements can be initialized with `stripeAccount`
            //    and load this PI from the right account.
            return {
                clientSecret: paymentIntent.client_secret,
                bookingId: booking.id,
                type: 'payment',
                stripeAccountId: (_f = stripeOpts === null || stripeOpts === void 0 ? void 0 : stripeOpts.stripeAccount) !== null && _f !== void 0 ? _f : null,
            };
        });
    }
    updatePaymentIntent(data, stripeOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            const { paymentIntentId, email, firstName, lastName, phone } = data;
            const paymentIntent = yield stripe_1.stripe.paymentIntents.update(paymentIntentId, {
                receipt_email: email,
            }, stripeOpts);
            return { success: true, paymentIntent };
        });
    }
    getPaymentIntentStatus(paymentIntentId, stripeOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!paymentIntentId) {
                throw new Error("Payment Intent ID is required");
            }
            const paymentIntent = yield stripe_1.stripe.paymentIntents.retrieve(paymentIntentId, stripeOpts);
            return {
                status: paymentIntent.status,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency
            };
        });
    }
    getSetupIntentStatus(setupIntentId, stripeOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!setupIntentId) {
                throw new Error('Setup Intent ID is required');
            }
            const setupIntent = yield stripe_1.stripe.setupIntents.retrieve(setupIntentId, stripeOpts);
            return {
                status: setupIntent.status,
                amount: 0,
                currency: 'usd'
            };
        });
    }
    calculatePrice(locationId, startTime, endTime, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !startTime || !endTime) {
                throw new Error('locationId, startTime, and endTime are required');
            }
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
                throw new Error('Invalid startTime or endTime');
            }
            // Get location timezone for proper pricing rule application
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('timezone')
                .eq('id', locationId)
                .single();
            if (locationError || !location) {
                throw new Error('Invalid location ID');
            }
            const timezone = location.timezone || 'America/New_York';
            const ctx = yield (0, pricing_utils_1.fetchPricingContext)(locationId, userId);
            const { userTypeRules, defaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, false);
            let total = 0;
            const breakdown = [];
            let cursorTime = new Date(startDate);
            let currentSegment = null;
            while (cursorTime < endDate) {
                const { localHour, dow } = (0, pricing_utils_1.localSlotInfo)(cursorTime, timezone);
                const rule = (0, pricing_utils_1.findRuleForSlot)(userTypeRules, defaultRules, localHour, dow);
                const priceForSlot = (rule.hourly_rate * 100) / 4;
                if (!currentSegment || currentSegment.rateName !== rule.name) {
                    if (currentSegment) {
                        breakdown.push({
                            rateName: currentSegment.rateName,
                            start: currentSegment.start,
                            rate: currentSegment.rate,
                            end: cursorTime.toISOString(),
                        });
                    }
                    currentSegment = {
                        rateName: rule.name,
                        start: cursorTime.toISOString(),
                        rate: 0,
                    };
                }
                currentSegment.rate += priceForSlot;
                total += priceForSlot;
                cursorTime.setUTCMinutes(cursorTime.getUTCMinutes() + 15);
            }
            if (currentSegment) {
                breakdown.push({
                    rateName: currentSegment.rateName,
                    start: currentSegment.start,
                    rate: currentSegment.rate,
                    end: endDate.toISOString(),
                });
            }
            // Apply membership benefits if user is a member
            let memberDiscount = 0;
            let freeMinutesApplied = 0;
            let membershipId = null;
            const regularTotal = total;
            if (userId) {
                try {
                    const membershipService = new membership_service_1.MembershipService();
                    const locationSettings = yield membershipService.getLocationMembershipSettings(locationId);
                    if (locationSettings.membershipsEnabled) {
                        const membership = yield membershipService.getActiveMembershipForUser(userId, locationId);
                        if (membership) {
                            membershipId = membership.id;
                            const benefits = membership.benefits;
                            const totalMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
                            // 1. Apply free minutes first
                            if (benefits.freeMinutesPerMonth && benefits.freeMinutesPerMonth > 0) {
                                const remainingFreeMinutes = benefits.freeMinutesPerMonth - (membership.free_minutes_used || 0);
                                if (remainingFreeMinutes > 0) {
                                    const minutesToApply = Math.min(remainingFreeMinutes, totalMinutes);
                                    const slotsToCredit = Math.floor(minutesToApply / 15);
                                    if (slotsToCredit > 0) {
                                        const avgSlotPrice = total / (totalMinutes / 15);
                                        const freeCredit = Math.round(slotsToCredit * avgSlotPrice);
                                        freeMinutesApplied = slotsToCredit * 15;
                                        total = Math.max(0, total - freeCredit);
                                    }
                                }
                            }
                            // 2. Apply discount on remaining amount
                            if (benefits.discountType && benefits.discountValue && benefits.discountValue > 0 && total > 0) {
                                const remainingMinutes = totalMinutes - freeMinutesApplied;
                                const remainingHours = remainingMinutes / 60;
                                if (benefits.discountType === 'fixed') {
                                    // Fixed discount is $ off per hour (e.g. $10/hr off)
                                    memberDiscount = Math.min(Math.round(benefits.discountValue * 100 * remainingHours), total);
                                }
                                else if (benefits.discountType === 'percentage') {
                                    // Percentage discount applies to the remaining total after free minutes
                                    memberDiscount = Math.round(total * (benefits.discountValue / 100));
                                }
                                total = Math.max(0, total - memberDiscount);
                            }
                        }
                    }
                }
                catch (memberErr) {
                    logger_1.logger.error({ err: memberErr }, 'Error checking membership for price calculation');
                }
            }
            return {
                total,
                currency: 'usd',
                breakdown,
                memberPricing: membershipId ? {
                    membershipId,
                    regularTotal,
                    memberDiscount,
                    freeMinutesApplied,
                    finalTotal: total,
                } : null,
            };
        });
    }
}
exports.PaymentService = PaymentService;
