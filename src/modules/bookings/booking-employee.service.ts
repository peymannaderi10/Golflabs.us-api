import { supabase } from '../../config/database';
import { stripe, getStripeOptions, getOrCreateCustomerForLocation } from '../../config/stripe';
import Stripe from 'stripe';
import { createISOTimestamp } from '../../shared/utils/date.utils';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../email/notification.service';
import { resendConfig } from '../../config/resend';
import { createUnlockToken } from '../../shared/utils/token.utils';
import { fetchPricingContext, splitRules, calculateSlotTotal } from '../../shared/utils/pricing.utils';
import { logger } from '../../shared/utils/logger';
import { LocationService } from '../locations/location.service';

export class BookingEmployeeService {

  async getAllBookingsForEmployee(locationId: string, startDate?: string, endDate?: string, spaceId?: string, customerEmail?: string) {
    let query = supabase
      .from('bookings')
      .select(`
        *,
        user_profiles(id, email, full_name, phone),
        spaces(id, name, space_number),
        payments(id, amount, status, stripe_payment_intent_id, refund_amount, refunded_at),
        booking_cancellations(cancelled_by, cancellation_reason, refund_amount, cancelled_at)
      `)
      .eq('location_id', locationId)
      .in('status', ['confirmed', 'cancelled']); // Only show actual reservations; exclude expired/abandoned

    if (startDate || endDate) {
      // Get the location's timezone first
      const { data: location } = await supabase
        .from('locations')
        .select('timezone')
        .eq('id', locationId)
        .single();

      const timezone = location?.timezone || 'America/New_York';

      // Use overlap filtering so cross-midnight bookings appear on both dates
      if (startDate) {
        const startOfRange = createISOTimestamp(startDate, '12:00 AM', timezone);
        query = query.gt('end_time', startOfRange);
      }

      if (endDate) {
        const endOfRange = createISOTimestamp(endDate, '11:59 PM', timezone);
        const endOfRangePlusOneMinute = new Date(new Date(endOfRange).getTime() + 60000).toISOString();
        query = query.lt('start_time', endOfRangePlusOneMinute);
      }
    }

    if (spaceId) {
      query = query.eq('space_id', spaceId);
    }

    const { data, error } = await query.order('start_time', { ascending: true }).limit(500);

    if (error) {
      logger.error({ err: error }, 'Error fetching bookings for employee');
      throw error;
    }

    // Filter by customer email if provided (done in memory since we need to join)
    let filteredData = data || [];
    if (customerEmail) {
      filteredData = filteredData.filter(booking =>
        booking.user_profiles?.email?.toLowerCase().includes(customerEmail.toLowerCase())
      );
    }

    return filteredData;
  }

  async searchCustomersByEmail(email: string, locationId: string) {
    if (!email || email.length < 3) {
      throw new Error('Email search requires at least 3 characters');
    }

    // Scope search to users associated with this location
    const { data: locationUsers, error: luError } = await supabase
      .from('user_locations')
      .select('user_id')
      .eq('location_id', locationId);

    if (luError) {
      logger.error({ err: luError }, 'Error fetching user_locations for search');
      throw luError;
    }

    const userIds = (locationUsers || []).map(r => r.user_id);
    if (userIds.length === 0) return [];

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, phone')
      .in('id', userIds)
      .ilike('email', `%${email}%`)
      .is('deleted_at', null)
      .order('email')
      .limit(20);

    if (error) {
      logger.error({ err: error }, 'Error searching customers');
      throw error;
    }

    return data;
  }

  async createEmployeeBooking(
    bookingData: {
      locationId: string;
      spaceId: string;
      date: string;
      startTime: string;
      endTime: string;
      partySize: number;
      totalAmount: number;
      notes?: string;
      userId?: string;
      newCustomer?: {
        email: string;
        fullName: string;
        phone?: string;
      };
    },
    employeeId: string
  ) {
    const { locationId, spaceId, date, startTime, endTime, partySize, totalAmount, notes, userId, newCustomer } = bookingData;

    // Validation
    if (!locationId || !spaceId || !date || !startTime || !endTime) {
      throw new Error('Missing required booking details');
    }

    if (!userId && !newCustomer) {
      throw new Error('Either userId or newCustomer details must be provided');
    }

    if (newCustomer && (!newCustomer.email || !newCustomer.fullName)) {
      throw new Error('New customer must have email and fullName');
    }

    // Get location timezone
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

    // Create timestamps
    const p_start_time = createISOTimestamp(date, startTime, timezone);
    const p_end_time = createISOTimestamp(date, endTime, timezone);

    logger.info({ timezone, date, startTime, endTime, p_start_time, p_end_time, employeeId }, 'Employee creating booking');

    // Determine the customer user ID
    let customerUserId = userId;

    // If new customer, create the user profile first
    if (newCustomer && !userId) {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', newCustomer.email.toLowerCase())
        .single();

      if (existingUser) {
        // Use existing user
        customerUserId = existingUser.id;
        logger.info({ customerUserId }, 'Found existing user for booking');
      } else {
        // Create a new user profile without auth (walk-in customer)
        const newUserId = crypto.randomUUID();

        const { data: createdUser, error: createUserError } = await supabase
          .from('user_profiles')
          .insert({
            id: newUserId,
            email: newCustomer.email.toLowerCase(),
            full_name: newCustomer.fullName,
            phone: newCustomer.phone || null,
            role: 'customer'
          })
          .select('id')
          .single();

        if (createUserError) {
          logger.error({ err: createUserError }, 'Error creating new customer');
          throw new Error('Failed to create customer profile');
        }

        customerUserId = createdUser.id;
        logger.info({ customerUserId }, 'Created new customer profile');
      }
    }

    if (!customerUserId) {
      throw new Error('Failed to determine customer ID');
    }

    // Associate customer with this location (idempotent)
    const { error: ulErr } = await supabase
      .from('user_locations')
      .upsert({ user_id: customerUserId, location_id: locationId }, { onConflict: 'user_id,location_id' });
    if (ulErr) logger.warn({ err: ulErr, userId: customerUserId, locationId }, 'Failed to upsert user_locations (non-critical)');

    // Fetch booking buffer for this location
    const { data: bufferRow } = await supabase
      .from('location_settings')
      .select('booking_buffer_minutes')
      .eq('location_id', locationId)
      .single();
    const bufferMinutes = bufferRow?.booking_buffer_minutes ?? 0;

    // Widen the query window by the buffer so we catch bookings whose
    // end_time + buffer overlaps our start. Filter precisely in code.
    const windowStart = new Date(new Date(p_start_time).getTime() - bufferMinutes * 60_000).toISOString();

    const { data: conflictingBookings, error: conflictError } = await supabase
      .from('bookings')
      .select('id, start_time, end_time')
      .eq('space_id', spaceId)
      .not('status', 'in', '("cancelled","expired","abandoned")')
      .or(`and(start_time.lt.${p_end_time},end_time.gt.${windowStart})`);

    if (conflictError) {
      logger.error({ err: conflictError }, 'Error checking for conflicts');
      throw new Error('Failed to check booking availability');
    }

    const hasConflict = conflictingBookings?.some(b => {
      const bStart = new Date(b.start_time).getTime();
      const bEndWithBuffer = new Date(b.end_time).getTime() + bufferMinutes * 60_000;
      const newStart = new Date(p_start_time).getTime();
      const newEnd = new Date(p_end_time).getTime();
      return bStart < newEnd && bEndWithBuffer > newStart;
    });

    if (hasConflict) {
      throw new Error('This time slot is no longer available');
    }

    // Create the booking with 'confirmed' status (no payment record created)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        location_id: locationId,
        user_id: customerUserId,
        space_id: spaceId,
        start_time: p_start_time,
        end_time: p_end_time,
        party_size: partySize,
        total_amount: totalAmount,
        status: 'confirmed', // Directly confirmed - no payment record created
        notes: notes || null,
        payment_intent_id: null // No payment intent for employee-created bookings
      })
      .select('id')
      .single();

    if (bookingError) {
      logger.error({ err: bookingError }, 'Error creating booking');
      if (bookingError.message?.includes('duplicate') || bookingError.message?.includes('already exists')) {
        throw new Error('This time slot is no longer available');
      }
      throw new Error('Failed to create booking');
    }

    const bookingId = booking.id;
    logger.info({ employeeId, bookingId }, 'Employee created booking (no payment record created)');

    // Send thank you email notification (always sent immediately, same as normal booking flow)
    try {
      await EmailService.sendThankYouEmail(bookingId);
      logger.info({ bookingId }, 'Queued thank you email for employee-created booking');
    } catch (emailError) {
      logger.error({ err: emailError, bookingId }, 'Error queuing thank you email for booking');
      // Don't fail the booking creation if email fails
    }

    // Check if booking starts within 15 minutes - if so, send reminder immediately (same as normal booking flow)
    try {
      const now = new Date();
      const bookingStart = new Date(p_start_time);
      const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

      logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Employee-created booking start time check');

      if (minutesUntilStart <= 15) {
        logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Employee-created booking starts soon, sending immediate reminder');

        const doorLockType = await LocationService.getDoorLockType(locationId);
        let unlockToken = '';
        let unlockLink = '';

        if (doorLockType !== 'none') {
          unlockToken = createUnlockToken(bookingId, p_start_time, p_end_time);
          unlockLink = `${resendConfig.frontendUrl}/unlock?token=${unlockToken}`;

          const { error: tokenUpdateError } = await supabase
            .from('bookings')
            .update({
              unlock_token: unlockToken,
              unlock_token_expires_at: p_end_time
            })
            .eq('id', bookingId);

          if (tokenUpdateError) {
            logger.error({ err: tokenUpdateError, bookingId }, 'Error updating unlock token for booking');
          }
        }

        await EmailService.sendReminderEmail(bookingId, unlockToken, unlockLink);
        logger.info({ bookingId, doorLockType }, 'Sent immediate reminder email for employee-created booking');
      } else {
        // Booking starts later - unlock token and reminder email will be sent by the reminder job
        logger.info({ bookingId }, 'Employee-created booking starts later, reminder will be sent by reminder job');
      }
    } catch (reminderError) {
      logger.error({ err: reminderError, bookingId }, 'Error handling reminder for employee-created booking');
      // Don't fail the booking creation if reminder handling fails
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        location_id: locationId,
        table_name: 'bookings',
        record_id: bookingId,
        action: 'employee_created_booking',
        old_values: null,
        new_values: {
          booking_id: bookingId,
          space_id: spaceId,
          customer_id: customerUserId,
          start_time: p_start_time,
          end_time: p_end_time,
          total_amount: totalAmount,
          party_size: partySize,
          notes: notes || null,
          new_customer_created: !userId && !!newCustomer
        },
        user_id: employeeId,
        timestamp: new Date().toISOString()
      });

    if (auditError) {
      logger.error({ err: auditError }, 'Error creating audit log');
      // Don't fail the booking, just log the error
    }

    // Get the created booking with full details
    const { data: fullBooking, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        *,
        user_profiles(id, email, full_name, phone),
        spaces(id, name, space_number)
      `)
      .eq('id', bookingId)
      .single();

    if (fetchError) {
      logger.error({ err: fetchError }, 'Error fetching created booking');
    }

    return {
      success: true,
      bookingId,
      locationId,
      spaceId,
      booking: fullBooking || { id: bookingId },
      message: 'Booking created successfully by employee'
    };
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
    if (!bookingId || !newStartTime || !newEndTime || !locationId || !spaceId) {
      throw new Error('bookingId, newStartTime, newEndTime, locationId, and spaceId are required');
    }

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);

    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      throw new Error('Invalid start or end time');
    }

    if (newEnd <= newStart) {
      throw new Error('End time must be after start time');
    }

    // 1. Fetch and validate the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, location_id, space_id, user_id, start_time, end_time, status, total_amount')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== 'confirmed') {
      throw new Error('Booking is not confirmed');
    }

    if (booking.location_id !== locationId) {
      throw new Error('Booking does not match the specified location');
    }

    // 2. Check for conflicts on the target bay (buffer-aware), excluding this booking
    const { data: bufferRow } = await supabase
      .from('location_settings')
      .select('booking_buffer_minutes')
      .eq('location_id', locationId)
      .single();
    const bufferMins = bufferRow?.booking_buffer_minutes ?? 0;

    const newStartWithBuffer = new Date(newStart.getTime() - bufferMins * 60_000);
    const newEndWithBuffer = new Date(newEnd.getTime() + bufferMins * 60_000);

    const { data: conflicts, error: conflictError } = await supabase
      .from('bookings')
      .select('id')
      .eq('space_id', spaceId)
      .neq('id', bookingId)
      .not('status', 'in', '("cancelled","expired","abandoned")')
      .lt('start_time', newEndWithBuffer.toISOString())
      .gt('end_time', newStartWithBuffer.toISOString());

    if (conflictError) {
      throw new Error('Failed to check availability');
    }

    if (conflicts && conflicts.length > 0) {
      throw new Error('New time conflicts with another booking');
    }

    // 3. Handle price adjustment if requested
    const originalStartTime = booking.start_time;
    const originalEndTime = booking.end_time;
    const currentTotalDollars = booking.total_amount || 0;
    let newTotalDollars = currentTotalDollars;
    let priceAdjustment: { type: 'charge' | 'refund' | 'collect_manually' | 'none'; amountCents: number; amountWithTaxCents: number } = { type: 'none', amountCents: 0, amountWithTaxCents: 0 };

    const reschedStripeOpts = await getStripeOptions(locationId);

    if (adjustPrice) {
      // Get location timezone and tax rate
      const { data: locationData } = await supabase
        .from('locations')
        .select('timezone, sales_tax_rate')
        .eq('id', locationId)
        .single();

      const timezone = locationData?.timezone || 'America/New_York';
      const taxRate = parseFloat(locationData?.sales_tax_rate) || 0;

      // Calculate new price using pricing rules
      const ctx = await fetchPricingContext(locationId, booking.user_id);
      const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, false);
      const newPriceCents = calculateSlotTotal(newStart, newEnd, timezone, userTypeRules, defaultRules);
      const newPriceDollars = newPriceCents / 100;

      const diffDollars = newPriceDollars - currentTotalDollars;
      const diffCents = Math.round(Math.abs(diffDollars) * 100);
      const diffWithTaxCents = Math.round(diffCents * (1 + taxRate));

      if (diffDollars > 0.01) {
        // New time is more expensive — try to charge the difference
        priceAdjustment = { type: 'charge', amountCents: diffCents, amountWithTaxCents: diffWithTaxCents };

        // Check if customer has a card on file
        let hasCard = false;
        let customerId: string | null = null;
        let paymentMethodId: string | null = null;
        let cardDetails: any = null;

        try {
          const resolved = await getOrCreateCustomerForLocation(booking.user_id, locationId);
          customerId = resolved.customerId;
        } catch (custErr: any) {
          logger.warn({ err: custErr, userId: booking.user_id, locationId }, 'Could not resolve Stripe customer for reschedule charge — falling back to collect_manually');
        }

        if (customerId) {
          const paymentMethods = await stripe.paymentMethods.list({
            customer: customerId,
            type: 'card',
            limit: 1
          }, reschedStripeOpts);
          if (paymentMethods.data && paymentMethods.data.length > 0) {
            hasCard = true;
            paymentMethodId = paymentMethods.data[0].id;
            cardDetails = paymentMethods.data[0].card;
          }
        }

        if (hasCard && customerId && paymentMethodId) {
          // Charge the saved card
          let paymentIntent: Stripe.PaymentIntent;
          try {
            paymentIntent = await stripe.paymentIntents.create({
              amount: diffWithTaxCents,
              currency: 'usd',
              customer: customerId,
              payment_method: paymentMethodId,
              off_session: true,
              confirm: true,
              metadata: {
                booking_id: bookingId,
                user_id: booking.user_id,
                space_id: spaceId,
                location_id: locationId,
                reschedule: 'true',
                price_adjustment: 'charge',
                pretax_amount_cents: diffCents.toString(),
                tax_rate: taxRate.toString(),
                initiated_by: 'employee',
                employee_id: employeeId
              }
            }, reschedStripeOpts);
          } catch (stripeError: any) {
            logger.error({ err: stripeError, bookingId }, 'Reschedule price adjustment charge failed');
            throw new Error('Payment failed: ' + stripeError.message);
          }

          await supabase.from('payments').insert({
            booking_id: bookingId,
            amount: diffWithTaxCents / 100,
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
        } else {
          // Manual booking — no card on file, flag as collect manually
          priceAdjustment = { ...priceAdjustment, type: 'collect_manually' };
          logger.info({ bookingId, diffWithTaxCents }, 'No card on file, price difference must be collected manually');
        }

        newTotalDollars = newPriceDollars;

      } else if (diffDollars < -0.01) {
        // New time is cheaper — refund the difference
        priceAdjustment = { type: 'refund', amountCents: diffCents, amountWithTaxCents: diffWithTaxCents };

        const { data: payment } = await supabase
          .from('payments')
          .select('stripe_payment_intent_id, amount')
          .eq('booking_id', bookingId)
          .eq('status', 'succeeded')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (payment && payment.stripe_payment_intent_id && !payment.stripe_payment_intent_id.startsWith('temp_')) {
          try {
            await stripe.refunds.create({
              payment_intent: payment.stripe_payment_intent_id,
              amount: diffWithTaxCents,
              metadata: {
                booking_id: bookingId,
                reschedule: 'true',
                price_adjustment: 'refund',
                pretax_amount_cents: diffCents.toString(),
                tax_rate: taxRate.toString(),
                employee_id: employeeId
              }
            }, reschedStripeOpts);

            await supabase
              .from('payments')
              .update({
                refund_amount: diffWithTaxCents / 100,
                refunded_at: new Date().toISOString()
              })
              .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);

            logger.info({ bookingId, refundAmountCents: diffWithTaxCents }, 'Reschedule partial refund processed');
          } catch (stripeError: any) {
            logger.error({ err: stripeError, bookingId }, 'Reschedule refund failed');
            // Don't fail the reschedule — just log it
          }
        }

        newTotalDollars = newPriceDollars;
      }
    }

    // 4. Update the booking times, price, and clear the old unlock token
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        space_id: spaceId,
        total_amount: newTotalDollars,
        unlock_token: null,
        unlock_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      logger.error({ err: updateError, bookingId }, 'Error rescheduling booking');
      throw new Error('Failed to reschedule booking');
    }

    // 5. Delete old reminder notification so the job re-queues at the new time
    await NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');

    // 6. Send booking time changed email
    await EmailService.sendBookingTimeChangedEmail(bookingId);

    // 7. Log the reschedule
    await supabase.from('access_logs').insert({
      location_id: locationId,
      space_id: spaceId,
      booking_id: bookingId,
      user_id: booking.user_id,
      action: 'booking_rescheduled',
      success: true,
      user_agent: 'Employee Dashboard',
      metadata: {
        original_start_time: originalStartTime,
        original_end_time: originalEndTime,
        new_start_time: newStart.toISOString(),
        new_end_time: newEnd.toISOString(),
        employee_id: employeeId,
        adjust_price: adjustPrice,
        price_adjustment: priceAdjustment.type,
        adjustment_amount_cents: priceAdjustment.amountWithTaxCents,
        old_total: currentTotalDollars,
        new_total: newTotalDollars
      }
    });

    logger.info({
      employeeId, bookingId,
      originalStart: originalStartTime, originalEnd: originalEndTime,
      newStart: newStart.toISOString(), newEnd: newEnd.toISOString(),
      adjustPrice, priceAdjustment: priceAdjustment.type,
      adjustmentCents: priceAdjustment.amountWithTaxCents,
      oldTotal: currentTotalDollars, newTotal: newTotalDollars
    }, 'Employee rescheduled booking');

    return {
      success: true,
      bookingId,
      locationId,
      spaceId,
      newStartTime: newStart.toISOString(),
      newEndTime: newEnd.toISOString(),
      priceAdjusted: adjustPrice && priceAdjustment.type !== 'none',
      adjustmentType: priceAdjustment.type,
      adjustmentAmount: priceAdjustment.amountWithTaxCents / 100,
      newTotal: newTotalDollars,
    };
  }
}
