import { supabase } from '../../config/database';
import { stripe } from '../../config/stripe';
import Stripe from 'stripe';
import { parseTimeString, createISOTimestamp } from '../../shared/utils/date.utils';
import { BookingDetails } from './booking.types';
import { EmailService } from '../email/email.service';
import { promotionService } from '../promotions/promotion.service';
import { resendConfig } from '../../config/resend';
import { CapacityHoldService } from './capacity-hold.service';
import { MembershipService } from '../memberships/membership.service';
import { createUnlockToken } from '../../shared/utils/token.utils';
import { logger } from '../../shared/utils/logger';
import { fetchPricingContext, splitRules, calculateSlotTotal } from '../../shared/utils/pricing.utils';

export class BookingService {
  private capacityHoldService = new CapacityHoldService();

  async reserveBooking(bookingData: BookingDetails) {
    const { 
      locationId, 
      userId, 
      bayId, 
      date, 
      startTime, 
      endTime, 
      partySize,
      totalAmount 
    } = bookingData;

    // Basic validation
    if (!locationId || !userId || !bayId || !date || !startTime || !endTime || !partySize || !totalAmount) {
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

    // Enforce booking window and available hours based on membership
    try {
      const membershipService = new MembershipService();
      const locationSettings = await membershipService.getLocationMembershipSettings(locationId);

      if (locationSettings.membershipsEnabled) {
        const membership = await membershipService.getActiveMembershipForUser(userId, locationId);
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

        // Available hours enforcement: is this user allowed to book at this time?
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
            throw new Error(`Non-member bookings are only available between ${allowedStart} and ${allowedEnd}. Become a member for extended hours.`);
          }
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

    // Get total bays at this location for capacity calculations
    const { data: baysData } = await supabase
      .from('bays')
      .select('id')
      .eq('location_id', locationId)
      .neq('status', 'closed');
    const totalBays = baysData?.length || 0;

    const holdConflict = await this.capacityHoldService.checkHoldConflict(
      locationId, date, start24, end24, totalBays
    );
    if (holdConflict) {
      const leagueName = holdConflict.league_name || 'League Night';
      throw new Error(`This time is reserved for ${leagueName}. Please choose a different time.`);
    }
    
    // Set expiration time using UTC timestamp
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    // Generate a temporary payment intent ID for the reservation
    const tempPaymentIntentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Call the PostgreSQL function to create booking and all related records
    const { data, error } = await supabase.rpc('create_booking_and_payment_record', {
      p_location_id: locationId,
      p_user_id: userId,
      p_bay_id: bayId,
      p_start_time: p_start_time,
      p_end_time: p_end_time,
      p_party_size: partySize,
      p_total_amount: totalAmount,
      p_payment_intent_id: tempPaymentIntentId,
      p_user_agent: 'API',
      p_ip_address: '0.0.0.0'
    });

    if (error) {
      logger.error({ err: error }, 'Error calling create_booking_and_payment_record function');
      // Handle common database errors
      if (error.message?.includes('duplicate key') || error.message?.includes('already exists')) {
        throw new Error('This time slot is no longer available.');
      }
      if (error.message?.includes('Time slot is already booked')) {
        throw new Error('This time slot is no longer available.');
      }
      throw error;
    }

    if (!data?.booking_id) {
      throw new Error('Failed to create booking - no booking ID returned');
    }

    logger.info({ bookingId: data.booking_id, bayId, p_start_time, p_end_time }, 'Created new booking');

    // Update the booking to have reserved status and set expiration
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'reserved',
        expires_at: expiresAt
      })
      .eq('id', data.booking_id);

    if (updateError) {
      logger.error({ err: updateError }, 'Error updating booking to reserved status');
      throw updateError;
    }

    logger.info({ bookingId: data.booking_id, expiresAt }, 'Successfully reserved booking');

    return {
      bookingId: data.booking_id,
      expiresAt: expiresAt
    };
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
    // Since overnight bookings are not allowed, we only want bookings that START on this specific date
    const endOfDayUTC = createISOTimestamp(date, '11:59 PM', timezone);
    
    // Add one minute to include 11:59 PM bookings but exclude midnight of next day
    const endOfDayPlusOneMinute = new Date(new Date(endOfDayUTC).getTime() + 60000).toISOString();

    // If startTime is provided (for "today" views), we need to filter out bookings that have already ended
    // But we should still include active bookings that started before the current time
    const filterEndTimeAfter = startTime ? createISOTimestamp(date, startTime, timezone) : null;

    logger.info({ date, timezone, startUTC: startOfDayUTC, endUTC: endOfDayPlusOneMinute, filterEndTimeAfter }, 'Fetching bookings');

    // Query bookings that START within this specific date
    // Include expires_at to filter out expired reserved bookings
    let query = supabase
      .from('bookings')
      .select('id, bay_id, user_id, start_time, end_time, status, expires_at')
      .eq('location_id', locationId)
      .gte('start_time', startOfDayUTC)
      .lt('start_time', endOfDayPlusOneMinute) // Exclude bookings that start on the next day
      .neq('status', 'cancelled')
      .neq('status', 'expired')
      .neq('status', 'abandoned');
    
    // If startTime filter is provided, only include bookings that END after that time
    // This ensures we still show active bookings that started earlier
    if (filterEndTimeAfter) {
      query = query.gt('end_time', filterEndTimeAfter);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error }, 'Error fetching bookings');
      throw new Error('Failed to fetch bookings');
    }

    // Filter out 'reserved' bookings that have expired (expires_at < now)
    // This ensures the UI shows the slot as available when the reservation has timed out
    const now = new Date().toISOString();
    const activeBookings = data.filter(booking => {
      if (booking.status === 'reserved' && booking.expires_at && booking.expires_at < now) {
        return false;
      }
      return true;
    });

    // Convert UTC timestamps back to local time for display
    const formattedBookings = activeBookings.map(booking => {
      const startTimeUTC = new Date(booking.start_time);
      const endTimeUTC = new Date(booking.end_time);
      
      // Convert to location timezone for display
      const startTimeLocal = startTimeUTC.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      });
      
      const endTimeLocal = endTimeUTC.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      });

      logger.debug({ bookingId: booking.id, utcTime: booking.start_time, localTime: startTimeLocal }, 'Booking time conversion');

      return {
        id: booking.id,
        bayId: booking.bay_id,
        userId: booking.user_id,
        startTime: startTimeLocal,
        endTime: endTimeLocal
      };
    });

    return formattedBookings;
  }

  async getUserReservedBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get current time in UTC
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, expires_at, bay_id, location_id, bays (name, bay_number)')
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
      bayId: reservation.bay_id,
      locationId: reservation.location_id,
      bayName: (reservation.bays as any)?.name || 'N/A',
      bayNumber: (reservation.bays as any)?.bay_number || 'N/A'
    };

    return { reservation: formattedReservation };
  }

  async getUserFutureBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Use current time (now) as cutoff instead of start of today
    // This ensures bookings that have already ended don't appear in "future" bookings
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
      .eq('user_id', userId)
      .gte('end_time', now) // Use end_time to ensure booking hasn't finished yet
      .not('status', 'in', '("reserved","expired","abandoned")')
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
      bayName: booking.bays?.name || 'N/A',
      bayNumber: booking.bays?.bay_number || 'N/A'
    }));

    return formattedBookings;
  }

  async getUserPastBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Use current time (now) as cutoff - bookings that have ended
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, bays (name, bay_number)')
      .eq('user_id', userId)
      .lt('end_time', now) // Use end_time to find bookings that have finished
      .not('status', 'in', '("abandoned")')
      .order('start_time', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching past user bookings');
      throw new Error('Failed to fetch past user bookings');
    }

    const formattedBookings = data.map((booking: any) => ({
      id: booking.id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      totalAmount: booking.total_amount,
      status: booking.status,
      bayName: booking.bays?.name || 'N/A',
      bayNumber: booking.bays?.bay_number || 'N/A'
    }));

    return formattedBookings;
  }

  async cancelBooking(bookingId: string, userId: string) {
    if (!bookingId || !userId) {
      throw new Error('Booking ID and User ID are required');
    }

    // 1. Get the booking details
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, user_id, start_time, status, total_amount, location_id, bay_id')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !booking) {
      throw new Error('Booking not found or access denied');
    }

    // 2. Check if booking can be cancelled
    if (booking.status === 'cancelled') {
      throw new Error('Booking is already cancelled');
    }

    if (booking.status !== 'confirmed') {
      throw new Error('Only confirmed bookings can be cancelled');
    }

    // 3. Check 24-hour policy
    const bookingStartTime = new Date(booking.start_time);
    const now = new Date();
    const hoursDifference = (bookingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDifference < 24) {
      throw new Error(`Bookings cannot be cancelled within 24 hours of the start time. Hours remaining: ${Math.round(hoursDifference * 10) / 10}`);
    }

    // 4. Get the payment record to process refund
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, amount, status')
      .eq('booking_id', bookingId)
      .eq('status', 'succeeded')
      .single();

    if (paymentError || !payment) {
      logger.warn({ bookingId }, 'No successful payment found for booking, cancelling without refund');
    }

    // 5. Process Stripe refund if payment exists
    let refundId = null;
    if (payment && payment.stripe_payment_intent_id) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: {
            booking_id: bookingId,
            user_id: userId,
            cancelled_at: new Date().toISOString()
          }
        });
        refundId = refund.id;
        logger.info({ bookingId, refundId: refund.id }, 'Refund created for booking');
      } catch (stripeError: any) {
        logger.error({ err: stripeError, bookingId }, 'Error creating refund for booking');
        throw new Error(`Failed to process refund. Please contact support. Details: ${stripeError.message}`);
      }
    }

    // 6. Update booking status to cancelled and immediately expire it
    const { error: updateBookingError } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        expires_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateBookingError) {
      logger.error({ err: updateBookingError, bookingId }, 'Error updating booking to cancelled');
      throw updateBookingError;
    }

    logger.info({ bookingId }, 'Booking cancelled and time slot freed for new reservations');

    // 7. Update payment status if refund was processed
    if (payment && refundId) {
      const { error: updatePaymentError } = await supabase
        .from('payments')
        .update({ 
          status: 'refunded',
          refund_amount: payment.amount,
          refunded_at: new Date().toISOString()
        })
        .eq('booking_id', bookingId);

      if (updatePaymentError) {
        logger.error({ err: updatePaymentError, bookingId }, 'Error updating payment status for booking');
        // Don't fail the request since booking was already cancelled and refund was processed
      }
    }

    // 8. Create cancellation record
    const { error: cancellationError } = await supabase
      .from('booking_cancellations')
      .insert({
        booking_id: bookingId,
        cancelled_by: userId,
        cancellation_reason: 'Customer requested cancellation',
        cancellation_fee: 0,
        refund_amount: payment ? payment.amount : 0,
        cancelled_at: new Date().toISOString()
      });

    if (cancellationError) {
      logger.error({ err: cancellationError, bookingId }, 'Error creating cancellation record for booking');
    }

    // 9. Send cancellation email notification
    try {
      await EmailService.sendCancellationEmail(
        bookingId,
        'Customer requested cancellation',
        'customer',
        payment ? payment.amount : undefined,
        !!refundId
      );
    } catch (emailError) {
      logger.error({ err: emailError, bookingId }, 'Error sending cancellation email for booking');
      // Don't fail the request since booking was already cancelled successfully
    }

    return {
      success: true,
      bookingId,
      refundId,
      locationId: booking.location_id,
      bayId: booking.bay_id,
      message: refundId ? 'Booking cancelled and refund processed' : 'Booking cancelled'
    };
  }

  // Employee-specific methods
  async getAllBookingsForEmployee(locationId: string, startDate?: string, endDate?: string, bayId?: string, customerEmail?: string) {
    let query = supabase
      .from('bookings')
      .select(`
        *,
        user_profiles(id, email, full_name, phone),
        bays(id, name, bay_number),
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
      
      // Use date range filtering
      if (startDate) {
        const startOfRange = createISOTimestamp(startDate, '12:00 AM', timezone);
        query = query.gte('start_time', startOfRange);
      }
      
      if (endDate) {
        const endOfRange = createISOTimestamp(endDate, '11:59 PM', timezone);
        const endOfRangePlusOneMinute = new Date(new Date(endOfRange).getTime() + 60000).toISOString();
        query = query.lt('start_time', endOfRangePlusOneMinute);
      }
    }

    if (bayId) {
      query = query.eq('bay_id', bayId);
    }

    const { data, error } = await query.order('start_time', { ascending: true });

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

  async searchCustomersByEmail(email: string) {
    if (!email || email.length < 3) {
      throw new Error('Email search requires at least 3 characters');
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, phone')
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

  async employeeCancelBooking(bookingId: string, employeeId: string, reason?: string) {
    if (!bookingId || !employeeId) {
      throw new Error('Booking ID and Employee ID are required');
    }

    // 1. Call the database function for atomic cancellation
    const { error: rpcError } = await supabase.rpc('cancel_booking_by_employee', {
      p_booking_id: bookingId,
      p_employee_user_id: employeeId,
      p_cancellation_reason: reason || 'Cancelled by staff'
    });

    if (rpcError) {
      logger.error({ err: rpcError, bookingId }, 'Error cancelling booking in database');
      throw new Error('Database cancellation failed: ' + rpcError.message);
    }

    // 2. Get the successful payment record to process the refund
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, amount')
      .eq('booking_id', bookingId)
      .eq('status', 'succeeded')
      .maybeSingle();

    if (paymentError) {
        logger.warn({ err: paymentError, bookingId }, 'Could not query payment for booking, cancelling without refund');
    }

    // 3. Process Stripe refund if a valid payment intent exists
    let refundId = null;
    if (payment && payment.stripe_payment_intent_id && !payment.stripe_payment_intent_id.startsWith('temp_')) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          amount: Math.round(payment.amount * 100), // Use amount from payment table and convert to cents
          metadata: {
            booking_id: bookingId,
            cancelled_by_employee: employeeId,
            cancelled_at: new Date().toISOString()
          }
        });
        refundId = refund.id;
        
        // 4. Update our payment record to show the refund
        await supabase
          .from('payments')
          .update({ 
            status: 'refunded', 
            refunded_at: new Date().toISOString(),
            refund_amount: payment.amount
          })
          .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);

        logger.info({ bookingId, refundId: refund.id }, 'Employee refund processed for booking');
      } catch (stripeError: any) {
        logger.error({ err: stripeError, bookingId }, 'Error processing employee refund for booking');
        // Don't fail the entire request since the booking is already cancelled in DB.
      }
    } else if (payment) {
        logger.warn({ bookingId }, 'Skipping refund for booking because a valid payment_intent_id was not found');
    }

    // 5. Get booking details needed for the socket update
    const { data: bookingDetails } = await supabase
      .from('bookings')
      .select('location_id, bay_id')
      .eq('id', bookingId)
      .single();

    // 6. Send cancellation email notification
    try {
      await EmailService.sendCancellationEmail(
        bookingId,
        reason || 'Cancelled by staff',
        'employee',
        payment ? payment.amount : undefined,
        !!refundId
      );
    } catch (emailError) {
      logger.error({ err: emailError, bookingId }, 'Error sending cancellation email for booking');
      // Don't fail the request since booking was already cancelled successfully
    }

    return {
      success: true,
      bookingId,
      refundId,
      locationId: bookingDetails?.location_id,
      bayId: bookingDetails?.bay_id,
      message: refundId ? 'Booking cancelled and refund processed by staff' : 'Booking cancelled by staff (no refund processed)'
    };
  }

  async cancelReservedBooking(bookingId: string, userId: string) {
    if (!bookingId || !userId) {
      throw new Error('Booking ID and User ID are required');
    }

    // 1. Get the booking details
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, user_id, start_time, status, location_id, bay_id')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !booking) {
      throw new Error('Reserved booking not found or access denied');
    }

    // 2. Check if booking can be cancelled (must be reserved status)
    if (booking.status !== 'reserved') {
      throw new Error('Only reserved bookings can be cancelled through this endpoint');
    }

    // 3. Update booking status to abandoned (reservation cancelled) and immediately expire it
    const { error: updateBookingError } = await supabase
      .from('bookings')
      .update({ 
        status: 'abandoned',
        expires_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateBookingError) {
      logger.error({ err: updateBookingError, bookingId }, 'Error updating reserved booking to cancelled');
      throw updateBookingError;
    }

    logger.info({ bookingId }, 'Reserved booking abandoned and time slot freed for new reservations');

    // 4. Create cancellation record (no refund needed since no payment was made)
    const { error: cancellationError } = await supabase
      .from('booking_cancellations')
      .insert({
        booking_id: bookingId,
        cancelled_by: userId,
        cancellation_reason: 'Reservation abandoned by customer',
        cancellation_fee: 0,
        refund_amount: 0,
        cancelled_at: new Date().toISOString()
      });

    if (cancellationError) {
      logger.error({ err: cancellationError, bookingId }, 'Error creating cancellation record for reserved booking');
      // Don't fail the request since booking was already cancelled successfully
    }

    return {
      success: true,
      bookingId,
      locationId: booking.location_id,
      bayId: booking.bay_id,
      message: 'Reservation abandoned successfully'
    };
  }

  /**
   * Apply a promotion discount to a booking after payment confirmation
   */
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
      // Don't throw - the booking is already confirmed, just log the error
      return false;
    }
  }

  /**
   * Get the discount info for a user's booking
   */
  async getBookingDiscountInfo(
    userId: string,
    bookingMinutes: number,
    originalAmount: number,
    hourlyRate?: number
  ) {
    return promotionService.calculateDiscountSimple(
      userId,
      bookingMinutes,
      originalAmount,
      hourlyRate
    );
  }

  /**
   * Create a booking directly by an employee (bypasses Stripe payment)
   * This is for rebooking customers (e.g., when something goes wrong) or walk-in bookings
   * No payment record is created - payment is handled separately or not applicable
   */
  async createEmployeeBooking(
    bookingData: {
      locationId: string;
      bayId: string;
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
    const { locationId, bayId, date, startTime, endTime, partySize, totalAmount, notes, userId, newCustomer } = bookingData;

    // Validation
    if (!locationId || !bayId || !date || !startTime || !endTime) {
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
        // Generate a random UUID for the user
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
      .eq('bay_id', bayId)
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
        bay_id: bayId,
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

      // If booking starts within 15 minutes, send reminder email immediately with unlock token
      if (minutesUntilStart <= 15) {
        logger.info({ bookingId, minutesUntilStart: minutesUntilStart.toFixed(1) }, 'Employee-created booking starts soon, sending immediate reminder');
        
        // Generate unlock token and link (same as normal booking flow)
        const unlockToken = createUnlockToken(bookingId, p_start_time, p_end_time);
        const unlockLink = `${resendConfig.frontendUrl}/unlock?token=${unlockToken}`;

        // Update booking with unlock token
        const { error: tokenUpdateError } = await supabase
          .from('bookings')
          .update({
            unlock_token: unlockToken,
            unlock_token_expires_at: p_end_time
          })
          .eq('id', bookingId);

        if (tokenUpdateError) {
          logger.error({ err: tokenUpdateError, bookingId }, 'Error updating unlock token for booking');
          // Don't fail the booking creation if token update fails
        }

        // Send reminder email immediately
        await EmailService.sendReminderEmail(bookingId, unlockToken, unlockLink);
        logger.info({ bookingId }, 'Sent immediate reminder email for employee-created booking');
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
          bay_id: bayId,
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
        bays(id, name, bay_number)
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
      bayId,
      booking: fullBooking || { id: bookingId },
      message: 'Booking created successfully by employee'
    };
  }

  // =====================================================
  // SESSION EXTENSION METHODS
  // =====================================================

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
      .select('timezone')
      .eq('id', booking.location_id)
      .single();

    if (locationError || !location) {
      throw new Error('Location not found');
    }

    const timezone = location.timezone || 'America/New_York';

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

    const options: { minutes: number; priceCents: number; priceFormatted: string }[] = [];

    for (const optionMinutes of requestedOptions) {
      if (optionMinutes > maxExtensionMinutes) continue;

      const extensionStart = new Date(endTime);
      const extensionEnd = new Date(endTime.getTime() + optionMinutes * 60 * 1000);
      const totalCents = calculateSlotTotal(extensionStart, extensionEnd, timezone, userTypeRules, defaultRules);

      options.push({
        minutes: optionMinutes,
        priceCents: totalCents,
        priceFormatted: `$${(totalCents / 100).toFixed(2)}`
      });
    }

    // 7. Get card on file info from the user's most recent successful payment
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
      card
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
    bayId: string
  ) {
    if (!bookingId || !extensionMinutes || !locationId || !bayId) {
      throw new Error('bookingId, extensionMinutes, locationId, and bayId are required');
    }

    if (![15, 30, 60].includes(extensionMinutes)) {
      throw new Error('extensionMinutes must be 15, 30, or 60');
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
      .select('timezone')
      .eq('id', locationId)
      .single();

    const timezone = location?.timezone || 'America/New_York';

    const ctx = await fetchPricingContext(locationId, booking.user_id);
    const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
    const totalCents = calculateSlotTotal(currentEndTime, newEndTime, timezone, userTypeRules, defaultRules);

    // 4. Get the user's Stripe Customer and saved payment method
    const { data: userProfile, error: userError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', booking.user_id)
      .single();

    if (userError || !userProfile?.stripe_customer_id) {
      throw new Error('No payment method on file. Please visit the front desk.');
    }

    const customerId = userProfile.stripe_customer_id;

    // Get the customer's saved payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1
    });

    if (!paymentMethods.data || paymentMethods.data.length === 0) {
      throw new Error('No saved card found. Please visit the front desk.');
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // 5. Charge off-session using the saved card
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
          original_end_time: currentEndTime.toISOString()
        }
      });
    } catch (stripeError: any) {
      logger.error({ err: stripeError, bookingId }, 'Extension payment failed for booking');

      // Log the failure
      await supabase.from('access_logs').insert({
        location_id: locationId,
        bay_id: bayId,
        booking_id: bookingId,
        user_id: booking.user_id,
        action: 'extension_payment_failed',
        success: false,
        error_message: stripeError.message,
        user_agent: 'Kiosk',
        metadata: { extension_minutes: extensionMinutes, amount_cents: totalCents }
      });

      throw new Error('Payment failed. Please visit the front desk.');
    }

    // 6. Extend the booking end_time and update total_amount
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_time: newEndTime.toISOString(),
        total_amount: (booking.total_amount || 0) + (totalCents / 100)
      })
      .eq('id', bookingId);

    if (updateError) {
      logger.error({ err: updateError, bookingId }, 'Error extending booking after successful payment');
      // Payment already succeeded - log this as critical
      throw new Error('Payment succeeded but failed to extend booking. Contact staff.');
    }

    // 7. Create a payment record for the extension
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

    // 8. Log the successful extension
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
        amount_cents: totalCents,
        original_end_time: currentEndTime.toISOString(),
        new_end_time: newEndTime.toISOString()
      }
    });

    logger.info({ bookingId, extensionMinutes, newEndTime: newEndTime.toISOString(), amountCharged: (totalCents / 100).toFixed(2) }, 'Successfully extended booking');

    return {
      success: true,
      bookingId,
      locationId,
      bayId,
      newEndTime: newEndTime.toISOString(),
      amountCharged: totalCents / 100,
      amountChargedFormatted: `$${(totalCents / 100).toFixed(2)}`
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

    // 3. Calculate the extension price
    const { data: location } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    const timezone = location?.timezone || 'America/New_York';

    const ctx = await fetchPricingContext(locationId, booking.user_id);
    const { userTypeRules, defaultRules } = splitRules(ctx.allRules, ctx.userType, ctx.defaultSlug, true);
    const totalCents = calculateSlotTotal(currentEndTime, newEndTime, timezone, userTypeRules, defaultRules);

    // 4. Charge the saved card unless skipPayment is true
    if (!skipPayment) {
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('id', booking.user_id)
        .single();

      if (userError || !userProfile?.stripe_customer_id) {
        throw new Error('No payment method on file for this customer');
      }

      const customerId = userProfile.stripe_customer_id;

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1
      });

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
        });
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