import { supabase } from '../../config/database';
import { stripe, getStripeOptions, getOrCreateCustomerForLocation } from '../../config/stripe';
import Stripe from 'stripe';
import { MembershipService } from '../memberships/membership.service';
import { fetchPricingContext, splitRules, calculateSlotTotal } from '../../shared/utils/pricing.utils';
import { logger } from '../../shared/utils/logger';

export class BookingExtensionService {

  /**
   * Get available extension options for an active booking.
   * Returns available durations with prices and card-on-file info.
   * Called by the kiosk when the countdown nears expiration.
   */
  async getExtensionOptions(bookingId: string, requestedOptions: number[] = [15, 30, 45, 60]) {
    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    // 1. Fetch the booking and validate it's currently active
    const { data: booking, error: bookingError } = await supabase
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
    const { data: location, error: locationError } = await supabase
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
    const { data: nextBookings, error: nextError } = await supabase
      .from('bookings')
      .select('start_time')
      .eq('bay_id', booking.bay_id)
      .neq('id', bookingId)
      .not('status', 'in', '("cancelled","expired","abandoned")')
      .gte('start_time', booking.end_time)
      .order('start_time', { ascending: true })
      .limit(1);

    if (nextError) {
      logger.error({ err: nextError }, 'Error fetching next bookings');
      throw new Error('Failed to check availability');
    }

    // Fetch booking buffer for this location
    const { data: bufferRow } = await supabase
      .from('location_settings')
      .select('booking_buffer_minutes')
      .eq('location_id', booking.location_id)
      .single();
    const bufferMinutes = bufferRow?.booking_buffer_minutes ?? 0;

    // Max extension = gap until next booking minus buffer, or default cap
    let maxExtensionMinutes = 60;
    if (nextBookings && nextBookings.length > 0) {
      const nextStart = new Date(nextBookings[0].start_time);
      const gapMinutes = (nextStart.getTime() - endTime.getTime()) / (1000 * 60);
      maxExtensionMinutes = Math.floor(gapMinutes) - bufferMinutes;
    }

    // 4. Fetch pricing context and calculate extension prices
    const ctx = await fetchPricingContext(booking.location_id, booking.user_id);
    const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, true);

    const options: { minutes: number; subtotalCents: number; taxCents: number; priceCents: number; priceFormatted: string }[] = [];

    for (const optionMinutes of requestedOptions) {
      if (optionMinutes > maxExtensionMinutes) continue;

      const extensionStart = new Date(endTime);
      const extensionEnd = new Date(endTime.getTime() + optionMinutes * 60 * 1000);
      const subtotalCents = calculateSlotTotal(extensionStart, extensionEnd, timezone, userTypeRules, defaultRules);
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
    let memberInfo: {
      isMember: boolean;
      membershipId: string;
      remainingFreeMinutes: number;
      discountType: string | null;
      discountValue: number;
      planName: string;
    } | null = null;

    try {
      const membershipService = new MembershipService();
      const locationSettings = await membershipService.getLocationMembershipSettings(booking.location_id);

      if (locationSettings.membershipsEnabled) {
        const membership = await membershipService.getActiveMembershipForUser(booking.user_id, booking.location_id);

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
            planName: (membership as any).plan_name || 'Member',
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
              } else if (benefits.discountType === 'percentage') {
                discount = Math.round(afterFree * (benefits.discountValue / 100));
              }
              afterFree = Math.max(0, afterFree - discount);
            }

            // Apply tax on discounted subtotal
            const memberTax = Math.round(afterFree * taxRate);
            const memberTotal = afterFree + memberTax;

            (opt as any).memberPriceCents = memberTotal;
            (opt as any).memberPriceFormatted = `$${(memberTotal / 100).toFixed(2)}`;
            (opt as any).freeMinutesApplied = freeSlots * 15;
          }
        }
      }
    } catch (memberErr) {
      logger.error({ err: memberErr }, 'Error checking membership for extension options');
    }

    // 6. Get card on file info from the user's most recent successful payment
    let card: { last4: string; brand: string } | null = null;

    const { data: recentPayment } = await supabase
      .from('payments')
      .select('card_last_four, card_brand')
      .eq('user_id', booking.user_id)
      .eq('status', 'succeeded')
      .not('card_last_four', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentPayment?.card_last_four) {
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
  }

  /**
   * Extend an active booking by charging the saved card off-session.
   * Called by the kiosk when the player confirms the extension.
   */
  async extendBooking(
    bookingId: string,
    extensionMinutes: number,
    locationId: string,
    bayId: string,
    useFreeMinutes = false
  ) {
    if (!bookingId || !extensionMinutes || !locationId || !bayId) {
      throw new Error('bookingId, extensionMinutes, locationId, and bayId are required');
    }

    if (![15, 30, 45, 60].includes(extensionMinutes)) {
      throw new Error('extensionMinutes must be 15, 30, 45, or 60');
    }

    // 1. Fetch and validate the booking
    const { data: booking, error: bookingError } = await supabase
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

    const { data: extBufRow } = await supabase
      .from('location_settings')
      .select('booking_buffer_minutes')
      .eq('location_id', locationId)
      .single();
    const extBufMins = extBufRow?.booking_buffer_minutes ?? 0;
    const newEndWithBuffer = new Date(newEndTime.getTime() + extBufMins * 60_000);

    const { data: conflicts, error: conflictError } = await supabase
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
    const { data: location } = await supabase
      .from('locations')
      .select('timezone, sales_tax_rate')
      .eq('id', locationId)
      .single();

    const timezone = location?.timezone || 'America/New_York';
    const taxRate = parseFloat(location?.sales_tax_rate) || 0;

    const ctx = await fetchPricingContext(locationId, booking.user_id);
    const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
    const subtotalCents = calculateSlotTotal(currentEndTime, newEndTime, timezone, userTypeRules, defaultRules);

    // 4. Apply membership benefits if requested
    let finalSubtotalCents = subtotalCents;
    let freeMinutesApplied = 0;
    let membershipId: string | null = null;

    if (useFreeMinutes) {
      try {
        const membershipService = new MembershipService();
        const membership = await membershipService.getActiveMembershipForUser(booking.user_id, locationId);

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
            } else if (benefits.discountType === 'percentage') {
              discount = Math.round(finalSubtotalCents * (benefits.discountValue / 100));
            }
            finalSubtotalCents = Math.max(0, finalSubtotalCents - discount);
          }

          logger.info({ bookingId, membershipId, freeMinutesApplied, subtotalCents, finalSubtotalCents }, 'Applied member benefits to extension');
        } else {
          logger.warn({ bookingId, userId: booking.user_id }, 'useFreeMinutes requested but no active membership found');
        }
      } catch (memberErr) {
        logger.error({ err: memberErr, bookingId }, 'Error applying member benefits to extension, charging full price');
      }
    }

    // 5. Apply tax on the final subtotal
    const finalTaxCents = Math.round(finalSubtotalCents * taxRate);
    const finalCents = finalSubtotalCents + finalTaxCents;

    // 6. Resolve Stripe Connect customer and options (only needed if charging)
    let customerId = '';
    let stripeOpts: Stripe.RequestOptions | undefined;
    let paymentMethodId = '';
    let cardDetails: Stripe.PaymentMethod.Card | null = null;

    if (finalCents > 0) {
      const resolved = await getOrCreateCustomerForLocation(booking.user_id, locationId);
      customerId = resolved.customerId;
      stripeOpts = resolved.stripeOpts;

      const paymentMethods = await stripe.paymentMethods.list({
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

    const paymentMetadata: Record<string, string> = {
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
    let stripePaymentIntentId: string | null = null;

    if (finalCents > 0) {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: finalCents,
          currency: 'usd',
          customer: customerId!,
          payment_method: paymentMethodId!,
          off_session: true,
          confirm: true,
          metadata: paymentMetadata,
        }, stripeOpts);
        stripePaymentIntentId = paymentIntent.id;
      } catch (stripeError: any) {
        logger.error({ err: stripeError, bookingId }, 'Extension payment failed');

        await supabase.from('access_logs').insert({
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
    } else {
      logger.info({ bookingId, membershipId }, 'Extension fully covered by membership — no Stripe charge');
    }

    // 7. Extend the booking end_time and update total_amount
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_time: newEndTime.toISOString(),
        total_amount: (booking.total_amount || 0) + (finalCents / 100)
      })
      .eq('id', bookingId);

    if (updateError) {
      logger.error({ err: updateError, bookingId }, 'Error extending booking after payment');
      throw new Error('Payment succeeded but failed to extend booking. Contact staff.');
    }

    // 8. Create a payment record
    await supabase.from('payments').insert({
      booking_id: bookingId,
      amount: finalCents / 100,
      status: 'succeeded',
      stripe_payment_intent_id: stripePaymentIntentId,
      currency: 'usd',
      user_id: booking.user_id,
      location_id: locationId,
      payment_method: finalCents > 0 ? 'card' : 'membership',
      card_last_four: finalCents > 0 ? (cardDetails?.last4 || null) : null,
      card_brand: finalCents > 0 ? (cardDetails?.brand || null) : null,
      processed_at: new Date().toISOString(),
      metadata: membershipId ? { membership_id: membershipId, member_free_minutes_applied: freeMinutesApplied } : null,
    });

    // 9. Deduct free minutes from membership (atomic increment)
    if (membershipId && freeMinutesApplied > 0) {
      try {
        const membershipService = new MembershipService();
        await supabase.rpc('increment_free_minutes_used', {
          p_membership_id: membershipId,
          p_delta: freeMinutesApplied,
        });
        await membershipService.logUsage(membershipId, bookingId, 'free_minutes', freeMinutesApplied);
        logger.info({ membershipId, freeMinutesApplied, bookingId }, 'Deducted free minutes for extension');
      } catch (usageErr) {
        logger.error({ err: usageErr, membershipId, bookingId }, 'Error deducting free minutes for extension');
      }
    }

    // 10. Log the successful extension
    await supabase.from('access_logs').insert({
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

    logger.info({ bookingId, extensionMinutes, newEndTime: newEndTime.toISOString(), amountCharged: (finalCents / 100).toFixed(2) }, 'Successfully extended booking');

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
  }

  /**
   * Employee-initiated booking extension.
   * Validates availability, updates end_time, and optionally charges the saved card.
   * When skipPayment is true the time is extended without a Stripe charge.
   */
  async employeeExtendBooking(
    bookingId: string,
    extensionMinutes: number,
    locationId: string,
    bayId: string,
    employeeId: string,
    skipPayment: boolean = false
  ) {
    if (!bookingId || !extensionMinutes || !locationId || !bayId) {
      throw new Error('bookingId, extensionMinutes, locationId, and bayId are required');
    }

    if (![15, 30, 45, 60].includes(extensionMinutes)) {
      throw new Error('extensionMinutes must be 15, 30, 45, or 60');
    }

    // 1. Fetch and validate the booking
    const { data: booking, error: bookingError } = await supabase
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

    const { data: empExtBufRow } = await supabase
      .from('location_settings')
      .select('booking_buffer_minutes')
      .eq('location_id', locationId)
      .single();
    const empExtBufMins = empExtBufRow?.booking_buffer_minutes ?? 0;
    const empNewEndWithBuffer = new Date(newEndTime.getTime() + empExtBufMins * 60_000);

    const { data: conflicts, error: conflictError } = await supabase
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
    const { data: empLocation } = await supabase
      .from('locations')
      .select('timezone, sales_tax_rate')
      .eq('id', locationId)
      .single();

    const timezone = empLocation?.timezone || 'America/New_York';
    const empTaxRate = parseFloat(empLocation?.sales_tax_rate) || 0;

    const ctx = await fetchPricingContext(locationId, booking.user_id);
    const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
    const subtotalCents = calculateSlotTotal(currentEndTime, newEndTime, timezone, userTypeRules, defaultRules);
    const taxCents = Math.round(subtotalCents * empTaxRate);
    const totalCents = subtotalCents + taxCents;

    // 4. Charge the saved card unless skipPayment is true
    if (!skipPayment) {
      const resolved = await getOrCreateCustomerForLocation(booking.user_id, locationId);
      const customerId = resolved.customerId;
      const empExtStripeOpts = resolved.stripeOpts;

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1
      }, empExtStripeOpts);

      if (!paymentMethods.data || paymentMethods.data.length === 0) {
        throw new Error('No saved card found for this customer');
      }

      const paymentMethodId = paymentMethods.data[0].id;

      let paymentIntent: Stripe.PaymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.create({
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
      } catch (stripeError: any) {
        logger.error({ err: stripeError, bookingId }, 'Employee extension payment failed for booking');

        await supabase.from('access_logs').insert({
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
      await supabase.from('payments').insert({
        booking_id: bookingId,
        amount: totalCents / 100,
        status: 'succeeded',
        stripe_payment_intent_id: paymentIntent.id,
        currency: 'usd',
        user_id: booking.user_id,
        location_id: locationId,
        payment_method: 'card',
        card_last_four: cardDetails?.last4 || null,
        card_brand: cardDetails?.brand || null,
        processed_at: new Date().toISOString()
      });
    }

    // 5. Extend the booking end_time and update total_amount
    const newTotalAmount = skipPayment
      ? (booking.total_amount || 0)
      : (booking.total_amount || 0) + (totalCents / 100);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_time: newEndTime.toISOString(),
        total_amount: newTotalAmount
      })
      .eq('id', bookingId);

    if (updateError) {
      logger.error({ err: updateError, bookingId }, 'Error extending booking');
      throw new Error('Failed to extend booking');
    }

    // 6. Log the successful extension
    await supabase.from('access_logs').insert({
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

    logger.info({ employeeId, bookingId, extensionMinutes, newEndTime: newEndTime.toISOString(), amountCharged: skipPayment ? 0 : (totalCents / 100), skipPayment }, 'Employee extended booking');

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
  }
}
