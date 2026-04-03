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
exports.BookingExtensionService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const membership_service_1 = require("../memberships/membership.service");
const pricing_utils_1 = require("../../shared/utils/pricing.utils");
const logger_1 = require("../../shared/utils/logger");
class BookingExtensionService {
    /**
     * Get available extension options for an active booking.
     * Returns available durations with prices and card-on-file info.
     * Called by the kiosk when the countdown nears expiration.
     */
    getExtensionOptions(bookingId_1) {
        return __awaiter(this, arguments, void 0, function* (bookingId, requestedOptions = [15, 30, 45, 60]) {
            var _a;
            if (!bookingId) {
                throw new Error('Booking ID is required');
            }
            // 1. Fetch the booking and validate it's currently active
            const { data: booking, error: bookingError } = yield database_1.supabase
                .from('bookings')
                .select('id, location_id, bay_id, user_id, start_time, end_time, status')
                .eq('id', bookingId)
                .single();
            if (bookingError || !booking) {
                throw new Error('Booking not found');
            }
            if (booking.status !== 'confirmed') {
                throw new Error('Booking is not confirmed');
            }
            const now = new Date();
            const endTime = new Date(booking.end_time);
            if (now >= endTime) {
                throw new Error('Booking has already ended');
            }
            // 2. Get location timezone
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('timezone, sales_tax_rate')
                .eq('id', booking.location_id)
                .single();
            if (locationError || !location) {
                throw new Error('Location not found');
            }
            const timezone = location.timezone || 'America/New_York';
            const taxRate = parseFloat(location.sales_tax_rate) || 0;
            // 3. Find the next booking on this bay to determine max extension
            // Use gte to catch back-to-back bookings (next starts exactly when current ends)
            const { data: nextBookings, error: nextError } = yield database_1.supabase
                .from('bookings')
                .select('start_time')
                .eq('bay_id', booking.bay_id)
                .neq('id', bookingId)
                .not('status', 'in', '("cancelled","expired","abandoned")')
                .gte('start_time', booking.end_time)
                .order('start_time', { ascending: true })
                .limit(1);
            if (nextError) {
                logger_1.logger.error({ err: nextError }, 'Error fetching next bookings');
                throw new Error('Failed to check availability');
            }
            // Fetch booking buffer for this location
            const { data: bufferRow } = yield database_1.supabase
                .from('location_settings')
                .select('booking_buffer_minutes')
                .eq('location_id', booking.location_id)
                .single();
            const bufferMinutes = (_a = bufferRow === null || bufferRow === void 0 ? void 0 : bufferRow.booking_buffer_minutes) !== null && _a !== void 0 ? _a : 0;
            // Max extension = gap until next booking minus buffer, or default cap
            let maxExtensionMinutes = 60;
            if (nextBookings && nextBookings.length > 0) {
                const nextStart = new Date(nextBookings[0].start_time);
                const gapMinutes = (nextStart.getTime() - endTime.getTime()) / (1000 * 60);
                maxExtensionMinutes = Math.floor(gapMinutes) - bufferMinutes;
            }
            // 4. Fetch pricing context and calculate extension prices
            const ctx = yield (0, pricing_utils_1.fetchPricingContext)(booking.location_id, booking.user_id);
            const { userTypeRules, defaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
            const options = [];
            for (const optionMinutes of requestedOptions) {
                if (optionMinutes > maxExtensionMinutes)
                    continue;
                const extensionStart = new Date(endTime);
                const extensionEnd = new Date(endTime.getTime() + optionMinutes * 60 * 1000);
                const subtotalCents = (0, pricing_utils_1.calculateSlotTotal)(extensionStart, extensionEnd, timezone, userTypeRules, defaultRules);
                const taxCents = Math.round(subtotalCents * taxRate);
                const totalCents = subtotalCents + taxCents;
                options.push({
                    minutes: optionMinutes,
                    subtotalCents,
                    taxCents,
                    priceCents: totalCents,
                    priceFormatted: `$${(totalCents / 100).toFixed(2)}`
                });
            }
            // 5. Check membership for member pricing
            let memberInfo = null;
            try {
                const membershipService = new membership_service_1.MembershipService();
                const locationSettings = yield membershipService.getLocationMembershipSettings(booking.location_id);
                if (locationSettings.membershipsEnabled) {
                    const membership = yield membershipService.getActiveMembershipForUser(booking.user_id, booking.location_id);
                    if (membership) {
                        const benefits = membership.benefits || {};
                        const freeMinutesPerMonth = benefits.freeMinutesPerMonth || 0;
                        const freeMinutesUsed = membership.free_minutes_used || 0;
                        const remainingFreeMinutes = Math.max(0, freeMinutesPerMonth - freeMinutesUsed);
                        memberInfo = {
                            isMember: true,
                            membershipId: membership.id,
                            remainingFreeMinutes,
                            discountType: benefits.discountType || null,
                            discountValue: benefits.discountValue || 0,
                            planName: membership.plan_name || 'Member',
                        };
                        // Calculate member prices for each option (discounts on subtotal, then add tax)
                        for (const opt of options) {
                            const freeMinToApply = Math.min(remainingFreeMinutes, opt.minutes);
                            const freeSlots = Math.floor(freeMinToApply / 15);
                            const totalSlots = opt.minutes / 15;
                            const avgSlotPrice = totalSlots > 0 ? opt.subtotalCents / totalSlots : 0;
                            const freeCredit = Math.round(freeSlots * avgSlotPrice);
                            let afterFree = Math.max(0, opt.subtotalCents - freeCredit);
                            // Apply member discount on remainder
                            let discount = 0;
                            if (benefits.discountType && benefits.discountValue && benefits.discountValue > 0 && afterFree > 0) {
                                const remainingMinutes = opt.minutes - (freeSlots * 15);
                                const remainingHours = remainingMinutes / 60;
                                if (benefits.discountType === 'fixed') {
                                    discount = Math.min(Math.round(benefits.discountValue * 100 * remainingHours), afterFree);
                                }
                                else if (benefits.discountType === 'percentage') {
                                    discount = Math.round(afterFree * (benefits.discountValue / 100));
                                }
                                afterFree = Math.max(0, afterFree - discount);
                            }
                            // Apply tax on discounted subtotal
                            const memberTax = Math.round(afterFree * taxRate);
                            const memberTotal = afterFree + memberTax;
                            opt.memberPriceCents = memberTotal;
                            opt.memberPriceFormatted = `$${(memberTotal / 100).toFixed(2)}`;
                            opt.freeMinutesApplied = freeSlots * 15;
                        }
                    }
                }
            }
            catch (memberErr) {
                logger_1.logger.error({ err: memberErr }, 'Error checking membership for extension options');
            }
            // 6. Get card on file info from the user's most recent successful payment
            let card = null;
            const { data: recentPayment } = yield database_1.supabase
                .from('payments')
                .select('card_last_four, card_brand')
                .eq('user_id', booking.user_id)
                .eq('status', 'succeeded')
                .not('card_last_four', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (recentPayment === null || recentPayment === void 0 ? void 0 : recentPayment.card_last_four) {
                card = {
                    last4: recentPayment.card_last_four,
                    brand: recentPayment.card_brand || 'card'
                };
            }
            return {
                bookingId: booking.id,
                currentEndTime: booking.end_time,
                maxExtensionMinutes,
                options,
                card,
                memberInfo,
            };
        });
    }
    /**
     * Extend an active booking by charging the saved card off-session.
     * Called by the kiosk when the player confirms the extension.
     */
    extendBooking(bookingId_1, extensionMinutes_1, locationId_1, bayId_1) {
        return __awaiter(this, arguments, void 0, function* (bookingId, extensionMinutes, locationId, bayId, useFreeMinutes = false) {
            var _a;
            if (!bookingId || !extensionMinutes || !locationId || !bayId) {
                throw new Error('bookingId, extensionMinutes, locationId, and bayId are required');
            }
            if (![15, 30, 45, 60].includes(extensionMinutes)) {
                throw new Error('extensionMinutes must be 15, 30, 45, or 60');
            }
            // 1. Fetch and validate the booking
            const { data: booking, error: bookingError } = yield database_1.supabase
                .from('bookings')
                .select('id, location_id, bay_id, user_id, start_time, end_time, status, total_amount')
                .eq('id', bookingId)
                .single();
            if (bookingError || !booking) {
                throw new Error('Booking not found');
            }
            if (booking.status !== 'confirmed') {
                throw new Error('Booking is not confirmed');
            }
            if (booking.bay_id !== bayId || booking.location_id !== locationId) {
                throw new Error('Booking does not match the specified bay/location');
            }
            const now = new Date();
            const currentEndTime = new Date(booking.end_time);
            if (now >= currentEndTime) {
                throw new Error('Booking has already ended');
            }
            // 2. Check availability for the extension window (buffer-aware)
            const newEndTime = new Date(currentEndTime.getTime() + extensionMinutes * 60 * 1000);
            const { data: extBufRow } = yield database_1.supabase
                .from('location_settings')
                .select('booking_buffer_minutes')
                .eq('location_id', locationId)
                .single();
            const extBufMins = (_a = extBufRow === null || extBufRow === void 0 ? void 0 : extBufRow.booking_buffer_minutes) !== null && _a !== void 0 ? _a : 0;
            const newEndWithBuffer = new Date(newEndTime.getTime() + extBufMins * 60000);
            const { data: conflicts, error: conflictError } = yield database_1.supabase
                .from('bookings')
                .select('id')
                .eq('bay_id', bayId)
                .neq('id', bookingId)
                .not('status', 'in', '("cancelled","expired","abandoned")')
                .lt('start_time', newEndWithBuffer.toISOString())
                .gt('end_time', currentEndTime.toISOString());
            if (conflictError) {
                throw new Error('Failed to check availability');
            }
            if (conflicts && conflicts.length > 0) {
                throw new Error('Extension would conflict with another booking');
            }
            // 3. Calculate the extension price
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('timezone, sales_tax_rate')
                .eq('id', locationId)
                .single();
            const timezone = (location === null || location === void 0 ? void 0 : location.timezone) || 'America/New_York';
            const taxRate = parseFloat(location === null || location === void 0 ? void 0 : location.sales_tax_rate) || 0;
            const ctx = yield (0, pricing_utils_1.fetchPricingContext)(locationId, booking.user_id);
            const { userTypeRules, defaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
            const subtotalCents = (0, pricing_utils_1.calculateSlotTotal)(currentEndTime, newEndTime, timezone, userTypeRules, defaultRules);
            // 4. Apply membership benefits if requested
            let finalSubtotalCents = subtotalCents;
            let freeMinutesApplied = 0;
            let membershipId = null;
            if (useFreeMinutes) {
                try {
                    const membershipService = new membership_service_1.MembershipService();
                    const membership = yield membershipService.getActiveMembershipForUser(booking.user_id, locationId);
                    if (membership) {
                        membershipId = membership.id;
                        const benefits = membership.benefits || {};
                        const freeMinutesPerMonth = benefits.freeMinutesPerMonth || 0;
                        const freeMinutesUsed = membership.free_minutes_used || 0;
                        const remainingFreeMinutes = Math.max(0, freeMinutesPerMonth - freeMinutesUsed);
                        // Apply free minutes (in 15-min slot increments)
                        if (remainingFreeMinutes > 0) {
                            const freeMinToApply = Math.min(remainingFreeMinutes, extensionMinutes);
                            const freeSlots = Math.floor(freeMinToApply / 15);
                            const totalSlots = extensionMinutes / 15;
                            const avgSlotPrice = totalSlots > 0 ? subtotalCents / totalSlots : 0;
                            const freeCredit = Math.round(freeSlots * avgSlotPrice);
                            freeMinutesApplied = freeSlots * 15;
                            finalSubtotalCents = Math.max(0, subtotalCents - freeCredit);
                        }
                        // Apply member discount on remainder
                        if (benefits.discountType && benefits.discountValue && benefits.discountValue > 0 && finalSubtotalCents > 0) {
                            const remainingMinutes = extensionMinutes - freeMinutesApplied;
                            const remainingHours = remainingMinutes / 60;
                            let discount = 0;
                            if (benefits.discountType === 'fixed') {
                                discount = Math.min(Math.round(benefits.discountValue * 100 * remainingHours), finalSubtotalCents);
                            }
                            else if (benefits.discountType === 'percentage') {
                                discount = Math.round(finalSubtotalCents * (benefits.discountValue / 100));
                            }
                            finalSubtotalCents = Math.max(0, finalSubtotalCents - discount);
                        }
                        logger_1.logger.info({ bookingId, membershipId, freeMinutesApplied, subtotalCents, finalSubtotalCents }, 'Applied member benefits to extension');
                    }
                    else {
                        logger_1.logger.warn({ bookingId, userId: booking.user_id }, 'useFreeMinutes requested but no active membership found');
                    }
                }
                catch (memberErr) {
                    logger_1.logger.error({ err: memberErr, bookingId }, 'Error applying member benefits to extension, charging full price');
                }
            }
            // 5. Apply tax on the final subtotal
            const finalTaxCents = Math.round(finalSubtotalCents * taxRate);
            const finalCents = finalSubtotalCents + finalTaxCents;
            // 6. Resolve Stripe Connect customer and options (only needed if charging)
            let customerId = '';
            let stripeOpts;
            let paymentMethodId = '';
            let cardDetails = null;
            if (finalCents > 0) {
                const resolved = yield (0, stripe_1.getOrCreateCustomerForLocation)(booking.user_id, locationId);
                customerId = resolved.customerId;
                stripeOpts = resolved.stripeOpts;
                const paymentMethods = yield stripe_1.stripe.paymentMethods.list({
                    customer: customerId,
                    type: 'card',
                    limit: 1
                }, stripeOpts);
                if (!paymentMethods.data || paymentMethods.data.length === 0) {
                    throw new Error('No saved card found. Please visit the front desk.');
                }
                paymentMethodId = paymentMethods.data[0].id;
                cardDetails = paymentMethods.data[0].card || null;
            }
            const paymentMetadata = {
                booking_id: bookingId,
                user_id: booking.user_id,
                bay_id: bayId,
                location_id: locationId,
                extension: 'true',
                extension_minutes: extensionMinutes.toString(),
                original_end_time: currentEndTime.toISOString(),
                subtotal_cents: finalSubtotalCents.toString(),
                tax_cents: finalTaxCents.toString(),
                tax_rate: taxRate.toString(),
            };
            if (membershipId) {
                paymentMetadata.membership_id = membershipId;
                paymentMetadata.member_free_minutes_applied = freeMinutesApplied.toString();
            }
            // 6. Charge or skip based on final amount
            let stripePaymentIntentId = null;
            if (finalCents > 0) {
                try {
                    const paymentIntent = yield stripe_1.stripe.paymentIntents.create({
                        amount: finalCents,
                        currency: 'usd',
                        customer: customerId,
                        payment_method: paymentMethodId,
                        off_session: true,
                        confirm: true,
                        metadata: paymentMetadata,
                    }, stripeOpts);
                    stripePaymentIntentId = paymentIntent.id;
                }
                catch (stripeError) {
                    logger_1.logger.error({ err: stripeError, bookingId }, 'Extension payment failed');
                    yield database_1.supabase.from('access_logs').insert({
                        location_id: locationId,
                        bay_id: bayId,
                        booking_id: bookingId,
                        user_id: booking.user_id,
                        action: 'extension_payment_failed',
                        success: false,
                        error_message: stripeError.message,
                        user_agent: 'Kiosk',
                        metadata: { extension_minutes: extensionMinutes, amount_cents: finalCents }
                    });
                    throw new Error('Payment failed. Please visit the front desk.');
                }
            }
            else {
                logger_1.logger.info({ bookingId, membershipId }, 'Extension fully covered by membership — no Stripe charge');
            }
            // 7. Extend the booking end_time and update total_amount
            const { error: updateError } = yield database_1.supabase
                .from('bookings')
                .update({
                end_time: newEndTime.toISOString(),
                total_amount: (booking.total_amount || 0) + (finalCents / 100)
            })
                .eq('id', bookingId);
            if (updateError) {
                logger_1.logger.error({ err: updateError, bookingId }, 'Error extending booking after payment');
                throw new Error('Payment succeeded but failed to extend booking. Contact staff.');
            }
            // 8. Create a payment record
            yield database_1.supabase.from('payments').insert({
                booking_id: bookingId,
                amount: finalCents / 100,
                status: 'succeeded',
                stripe_payment_intent_id: stripePaymentIntentId,
                currency: 'usd',
                user_id: booking.user_id,
                location_id: locationId,
                payment_method: finalCents > 0 ? 'card' : 'membership',
                card_last_four: finalCents > 0 ? ((cardDetails === null || cardDetails === void 0 ? void 0 : cardDetails.last4) || null) : null,
                card_brand: finalCents > 0 ? ((cardDetails === null || cardDetails === void 0 ? void 0 : cardDetails.brand) || null) : null,
                processed_at: new Date().toISOString(),
                metadata: membershipId ? { membership_id: membershipId, member_free_minutes_applied: freeMinutesApplied } : null,
            });
            // 9. Deduct free minutes from membership (atomic increment)
            if (membershipId && freeMinutesApplied > 0) {
                try {
                    const membershipService = new membership_service_1.MembershipService();
                    yield database_1.supabase.rpc('increment_free_minutes_used', {
                        p_membership_id: membershipId,
                        p_delta: freeMinutesApplied,
                    });
                    yield membershipService.logUsage(membershipId, bookingId, 'free_minutes', freeMinutesApplied);
                    logger_1.logger.info({ membershipId, freeMinutesApplied, bookingId }, 'Deducted free minutes for extension');
                }
                catch (usageErr) {
                    logger_1.logger.error({ err: usageErr, membershipId, bookingId }, 'Error deducting free minutes for extension');
                }
            }
            // 10. Log the successful extension
            yield database_1.supabase.from('access_logs').insert({
                location_id: locationId,
                bay_id: bayId,
                booking_id: bookingId,
                user_id: booking.user_id,
                action: 'extension_accepted',
                success: true,
                user_agent: 'Kiosk',
                metadata: {
                    extension_minutes: extensionMinutes,
                    amount_cents: finalCents,
                    subtotal_cents: finalSubtotalCents,
                    tax_cents: finalTaxCents,
                    regular_subtotal_cents: subtotalCents,
                    free_minutes_applied: freeMinutesApplied,
                    membership_id: membershipId,
                    original_end_time: currentEndTime.toISOString(),
                    new_end_time: newEndTime.toISOString()
                }
            });
            logger_1.logger.info({ bookingId, extensionMinutes, newEndTime: newEndTime.toISOString(), amountCharged: (finalCents / 100).toFixed(2) }, 'Successfully extended booking');
            return {
                success: true,
                bookingId,
                locationId,
                bayId,
                newEndTime: newEndTime.toISOString(),
                amountCharged: finalCents / 100,
                amountChargedFormatted: `$${(finalCents / 100).toFixed(2)}`,
                freeMinutesApplied,
            };
        });
    }
    /**
     * Employee-initiated booking extension.
     * Validates availability, updates end_time, and optionally charges the saved card.
     * When skipPayment is true the time is extended without a Stripe charge.
     */
    employeeExtendBooking(bookingId_1, extensionMinutes_1, locationId_1, bayId_1, employeeId_1) {
        return __awaiter(this, arguments, void 0, function* (bookingId, extensionMinutes, locationId, bayId, employeeId, skipPayment = false) {
            var _a;
            if (!bookingId || !extensionMinutes || !locationId || !bayId) {
                throw new Error('bookingId, extensionMinutes, locationId, and bayId are required');
            }
            if (![15, 30, 45, 60].includes(extensionMinutes)) {
                throw new Error('extensionMinutes must be 15, 30, 45, or 60');
            }
            // 1. Fetch and validate the booking
            const { data: booking, error: bookingError } = yield database_1.supabase
                .from('bookings')
                .select('id, location_id, bay_id, user_id, start_time, end_time, status, total_amount')
                .eq('id', bookingId)
                .single();
            if (bookingError || !booking) {
                throw new Error('Booking not found');
            }
            if (booking.status !== 'confirmed') {
                throw new Error('Booking is not confirmed');
            }
            if (booking.bay_id !== bayId || booking.location_id !== locationId) {
                throw new Error('Booking does not match the specified bay/location');
            }
            const now = new Date();
            const currentEndTime = new Date(booking.end_time);
            if (now >= currentEndTime) {
                throw new Error('Booking has already ended');
            }
            // 2. Check availability for the extension window (buffer-aware)
            const newEndTime = new Date(currentEndTime.getTime() + extensionMinutes * 60 * 1000);
            const { data: empExtBufRow } = yield database_1.supabase
                .from('location_settings')
                .select('booking_buffer_minutes')
                .eq('location_id', locationId)
                .single();
            const empExtBufMins = (_a = empExtBufRow === null || empExtBufRow === void 0 ? void 0 : empExtBufRow.booking_buffer_minutes) !== null && _a !== void 0 ? _a : 0;
            const empNewEndWithBuffer = new Date(newEndTime.getTime() + empExtBufMins * 60000);
            const { data: conflicts, error: conflictError } = yield database_1.supabase
                .from('bookings')
                .select('id')
                .eq('bay_id', bayId)
                .neq('id', bookingId)
                .not('status', 'in', '("cancelled","expired","abandoned")')
                .lt('start_time', empNewEndWithBuffer.toISOString())
                .gt('end_time', currentEndTime.toISOString());
            if (conflictError) {
                throw new Error('Failed to check availability');
            }
            if (conflicts && conflicts.length > 0) {
                throw new Error('Extension would conflict with another booking');
            }
            // 3. Calculate the extension price (with tax)
            const { data: empLocation } = yield database_1.supabase
                .from('locations')
                .select('timezone, sales_tax_rate')
                .eq('id', locationId)
                .single();
            const timezone = (empLocation === null || empLocation === void 0 ? void 0 : empLocation.timezone) || 'America/New_York';
            const empTaxRate = parseFloat(empLocation === null || empLocation === void 0 ? void 0 : empLocation.sales_tax_rate) || 0;
            const ctx = yield (0, pricing_utils_1.fetchPricingContext)(locationId, booking.user_id);
            const { userTypeRules, defaultRules } = (0, pricing_utils_1.splitRules)(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
            const subtotalCents = (0, pricing_utils_1.calculateSlotTotal)(currentEndTime, newEndTime, timezone, userTypeRules, defaultRules);
            const taxCents = Math.round(subtotalCents * empTaxRate);
            const totalCents = subtotalCents + taxCents;
            // 4. Charge the saved card unless skipPayment is true
            if (!skipPayment) {
                const resolved = yield (0, stripe_1.getOrCreateCustomerForLocation)(booking.user_id, locationId);
                const customerId = resolved.customerId;
                const empExtStripeOpts = resolved.stripeOpts;
                const paymentMethods = yield stripe_1.stripe.paymentMethods.list({
                    customer: customerId,
                    type: 'card',
                    limit: 1
                }, empExtStripeOpts);
                if (!paymentMethods.data || paymentMethods.data.length === 0) {
                    throw new Error('No saved card found for this customer');
                }
                const paymentMethodId = paymentMethods.data[0].id;
                let paymentIntent;
                try {
                    paymentIntent = yield stripe_1.stripe.paymentIntents.create({
                        amount: totalCents,
                        currency: 'usd',
                        customer: customerId,
                        payment_method: paymentMethodId,
                        off_session: true,
                        confirm: true,
                        metadata: {
                            booking_id: bookingId,
                            user_id: booking.user_id,
                            bay_id: bayId,
                            location_id: locationId,
                            extension: 'true',
                            extension_minutes: extensionMinutes.toString(),
                            original_end_time: currentEndTime.toISOString(),
                            initiated_by: 'employee',
                            employee_id: employeeId
                        }
                    }, empExtStripeOpts);
                }
                catch (stripeError) {
                    logger_1.logger.error({ err: stripeError, bookingId }, 'Employee extension payment failed for booking');
                    yield database_1.supabase.from('access_logs').insert({
                        location_id: locationId,
                        bay_id: bayId,
                        booking_id: bookingId,
                        user_id: booking.user_id,
                        action: 'extension_payment_failed',
                        success: false,
                        error_message: stripeError.message,
                        user_agent: 'Employee Dashboard',
                        metadata: { extension_minutes: extensionMinutes, amount_cents: totalCents, employee_id: employeeId }
                    });
                    throw new Error('Payment failed: ' + stripeError.message);
                }
                // Create payment record
                const cardDetails = paymentMethods.data[0].card;
                yield database_1.supabase.from('payments').insert({
                    booking_id: bookingId,
                    amount: totalCents / 100,
                    status: 'succeeded',
                    stripe_payment_intent_id: paymentIntent.id,
                    currency: 'usd',
                    user_id: booking.user_id,
                    location_id: locationId,
                    payment_method: 'card',
                    card_last_four: (cardDetails === null || cardDetails === void 0 ? void 0 : cardDetails.last4) || null,
                    card_brand: (cardDetails === null || cardDetails === void 0 ? void 0 : cardDetails.brand) || null,
                    processed_at: new Date().toISOString()
                });
            }
            // 5. Extend the booking end_time and update total_amount
            const newTotalAmount = skipPayment
                ? (booking.total_amount || 0)
                : (booking.total_amount || 0) + (totalCents / 100);
            const { error: updateError } = yield database_1.supabase
                .from('bookings')
                .update({
                end_time: newEndTime.toISOString(),
                total_amount: newTotalAmount
            })
                .eq('id', bookingId);
            if (updateError) {
                logger_1.logger.error({ err: updateError, bookingId }, 'Error extending booking');
                throw new Error('Failed to extend booking');
            }
            // 6. Log the successful extension
            yield database_1.supabase.from('access_logs').insert({
                location_id: locationId,
                bay_id: bayId,
                booking_id: bookingId,
                user_id: booking.user_id,
                action: 'extension_accepted',
                success: true,
                user_agent: 'Employee Dashboard',
                metadata: {
                    extension_minutes: extensionMinutes,
                    amount_cents: skipPayment ? 0 : totalCents,
                    original_end_time: currentEndTime.toISOString(),
                    new_end_time: newEndTime.toISOString(),
                    skip_payment: skipPayment,
                    employee_id: employeeId
                }
            });
            logger_1.logger.info({ employeeId, bookingId, extensionMinutes, newEndTime: newEndTime.toISOString(), amountCharged: skipPayment ? 0 : (totalCents / 100), skipPayment }, 'Employee extended booking');
            return {
                success: true,
                bookingId,
                locationId,
                bayId,
                newEndTime: newEndTime.toISOString(),
                amountCharged: skipPayment ? 0 : totalCents / 100,
                amountChargedFormatted: skipPayment ? '$0.00' : `$${(totalCents / 100).toFixed(2)}`,
                paymentSkipped: skipPayment
            };
        });
    }
}
exports.BookingExtensionService = BookingExtensionService;
