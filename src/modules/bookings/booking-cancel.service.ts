import { supabase } from '../../config/database';
import { stripe, getStripeOptions } from '../../config/stripe';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../email/notification.service';
import { logger } from '../../shared/utils/logger';

export class BookingCancelService {

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

    // 3. Resolve Stripe Connect options
    const stripeOpts = await getStripeOptions(booking.location_id);

    // 4. Check 24-hour policy
    const bookingStartTime = new Date(booking.start_time);
    const now = new Date();
    const hoursDifference = (bookingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDifference < 24) {
      throw new Error(`Bookings cannot be cancelled within 24 hours of the start time. Hours remaining: ${Math.round(hoursDifference * 10) / 10}`);
    }

    // 4. Get ALL successful payment records (original + extensions) to process refunds
    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, amount, status, metadata')
      .eq('booking_id', bookingId)
      .eq('status', 'succeeded');

    if (paymentError) {
      logger.warn({ err: paymentError, bookingId }, 'Could not query payments for booking, cancelling without refund');
    }

    // 5. Process Stripe refund for each payment (skip SetupIntents — $0 bookings have no charge)
    const refundIds: string[] = [];
    for (const payment of (payments || [])) {
      if (!payment.stripe_payment_intent_id || payment.stripe_payment_intent_id.startsWith('seti_')) continue;

      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: {
            booking_id: bookingId,
            user_id: userId,
            cancelled_at: new Date().toISOString()
          }
        }, stripeOpts);
        refundIds.push(refund.id);
        logger.info({ bookingId, refundId: refund.id, amount: payment.amount }, 'Refund created for payment');

        // Update this payment record
        await supabase
          .from('payments')
          .update({
            status: 'refunded',
            refund_amount: payment.amount,
            refunded_at: new Date().toISOString()
          })
          .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);
      } catch (stripeError: any) {
        logger.error({ err: stripeError, bookingId, piId: payment.stripe_payment_intent_id }, 'Error creating refund');
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

    // 7. Create cancellation record
    const totalRefundAmount = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const { error: cancellationError } = await supabase
      .from('booking_cancellations')
      .insert({
        booking_id: bookingId,
        cancelled_by: userId,
        cancellation_reason: 'Customer requested cancellation',
        cancellation_fee: 0,
        refund_amount: totalRefundAmount,
        cancelled_at: new Date().toISOString()
      });

    if (cancellationError) {
      logger.error({ err: cancellationError, bookingId }, 'Error creating cancellation record for booking');
    }

    // 8. Restore membership free minutes if any were used for this booking
    for (const payment of (payments || [])) {
      try {
        let restoreMembershipId: string | null = null;
        let restoreFreeMinutes = 0;

        // Try Stripe metadata first (paid bookings)
        if (payment.stripe_payment_intent_id) {
          const stripeId = payment.stripe_payment_intent_id;
          const stripeObj = stripeId.startsWith('seti_')
            ? await stripe.setupIntents.retrieve(stripeId, stripeOpts)
            : await stripe.paymentIntents.retrieve(stripeId, stripeOpts);
          restoreMembershipId = stripeObj.metadata?.membership_id || null;
          restoreFreeMinutes = parseFloat(stripeObj.metadata?.member_free_minutes_applied || '0');
        }

        // Fallback to local payment metadata ($0 extensions / free bookings)
        if (!restoreMembershipId && payment.metadata) {
          const meta = payment.metadata as any;
          restoreMembershipId = meta.membership_id || null;
          restoreFreeMinutes = parseFloat(meta.member_free_minutes_applied || '0');
        }

        if (restoreMembershipId && restoreFreeMinutes > 0) {
          await supabase.rpc('increment_free_minutes_used', {
            p_membership_id: restoreMembershipId,
            p_delta: -restoreFreeMinutes,
          });
          logger.info({ membershipId: restoreMembershipId, freeMinutesApplied: restoreFreeMinutes, bookingId }, 'Restored free minutes after booking cancellation');
        }
      } catch (memberErr) {
        logger.error({ err: memberErr, bookingId }, 'Error restoring membership free minutes on cancellation');
      }
    }

    // 9. Delete any pending reminder notification so it doesn't fire after cancellation
    await NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');

    // 10. Send cancellation email notification
    try {
      await EmailService.sendCancellationEmail(
        bookingId,
        'Customer requested cancellation',
        'customer',
        totalRefundAmount > 0 ? totalRefundAmount : undefined,
        refundIds.length > 0
      );
    } catch (emailError) {
      logger.error({ err: emailError, bookingId }, 'Error sending cancellation email for booking');
      // Don't fail the request since booking was already cancelled successfully
    }

    return {
      success: true,
      bookingId,
      refundIds,
      locationId: booking.location_id,
      bayId: booking.bay_id,
      message: refundIds.length > 0 ? 'Booking cancelled and refund processed' : 'Booking cancelled'
    };
  }

  async employeeCancelBooking(bookingId: string, employeeId: string, reason?: string, skipRefund = false) {
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

    // 2. Get booking location for Stripe Connect options
    const { data: empBooking } = await supabase
      .from('bookings')
      .select('location_id')
      .eq('id', bookingId)
      .single();

    const empStripeOpts = empBooking ? await getStripeOptions(empBooking.location_id) : undefined;

    // 3. Process refunds unless skipRefund is true
    const refundIds: string[] = [];

    if (!skipRefund) {
      // Get ALL successful payment records (original + extensions) to process refunds
      const { data: payments, error: paymentError } = await supabase
        .from('payments')
        .select('stripe_payment_intent_id, amount')
        .eq('booking_id', bookingId)
        .eq('status', 'succeeded');

      if (paymentError) {
          logger.warn({ err: paymentError, bookingId }, 'Could not query payments for booking, cancelling without refund');
      }

      // 4. Process Stripe refund for each payment record
      for (const payment of (payments || [])) {
        if (!payment.stripe_payment_intent_id || payment.stripe_payment_intent_id.startsWith('temp_')) {
          logger.warn({ bookingId, piId: payment.stripe_payment_intent_id }, 'Skipping refund — no valid payment_intent_id');
          continue;
        }

        try {
          const refund = await stripe.refunds.create({
            payment_intent: payment.stripe_payment_intent_id,
            amount: Math.round(payment.amount * 100),
            metadata: {
              booking_id: bookingId,
              cancelled_by_employee: employeeId,
              cancelled_at: new Date().toISOString()
            }
          }, empStripeOpts);
          refundIds.push(refund.id);

          await supabase
            .from('payments')
            .update({
              status: 'refunded',
              refunded_at: new Date().toISOString(),
              refund_amount: payment.amount
            })
            .eq('stripe_payment_intent_id', payment.stripe_payment_intent_id);

          logger.info({ bookingId, refundId: refund.id, amount: payment.amount }, 'Employee refund processed for payment');
        } catch (stripeError: any) {
          logger.error({ err: stripeError, bookingId, piId: payment.stripe_payment_intent_id }, 'Error processing employee refund');
          // Don't fail the entire request since the booking is already cancelled in DB.
        }
      }
    } else {
      logger.info({ bookingId, employeeId }, 'Refund skipped — session ended without refund');
    }

    // 5. Get booking details needed for the socket update
    const { data: bookingDetails } = await supabase
      .from('bookings')
      .select('location_id, bay_id')
      .eq('id', bookingId)
      .single();

    // 6. Delete any pending reminder notification so it doesn't fire after cancellation
    await NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');

    // 7. Send cancellation email notification
    const cancelReason = skipRefund
      ? (reason || 'Session ended by staff')
      : (reason || 'Cancelled by staff');
    try {
      await EmailService.sendCancellationEmail(
        bookingId,
        cancelReason,
        'employee',
        undefined,
        refundIds.length > 0
      );
    } catch (emailError) {
      logger.error({ err: emailError, bookingId }, 'Error sending cancellation email for booking');
    }

    return {
      success: true,
      bookingId,
      refundIds,
      refunded: refundIds.length > 0,
      locationId: bookingDetails?.location_id,
      bayId: bookingDetails?.bay_id,
      message: skipRefund
        ? 'Session ended by staff (no refund)'
        : refundIds.length > 0
          ? `Booking cancelled and ${refundIds.length} payment(s) refunded by staff`
          : 'Booking cancelled by staff (no refund processed)'
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
}
