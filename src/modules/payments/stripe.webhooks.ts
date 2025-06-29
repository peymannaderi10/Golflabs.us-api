import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, webhookSecret } from '../../config/stripe';
import { supabase } from '../../config/database';
import { EmailService } from '../email/email.service';
import { SocketService } from '../sockets/socket.service';

export async function handleStripeWebhook(req: Request, res: Response, socketService: SocketService) {
  const sig = req.headers['stripe-signature'] as string;

  if (!webhookSecret) {
    console.error("Stripe webhook secret not found.");
    return res.status(400).send('Webhook Error: Missing secret');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event based on type
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.canceled':
    case 'payment_intent.payment_failed':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata.booking_id;

      if (!bookingId) {
        console.warn(`Webhook received for event ${event.type} with no booking_id in metadata.`);
        return res.status(200).send({ received: true, message: 'No booking_id found, ignoring.' });
      }

      if (event.type === 'payment_intent.succeeded') {
        console.log(`Payment succeeded for booking ID: ${bookingId}. Updating database...`);

        // Update booking status to 'confirmed' and clear expiration
        const { error: bookingError } = await supabase
          .from('bookings')
          .update({ status: 'confirmed', expires_at: null })
          .eq('id', bookingId);
          
        // Update payment status to 'succeeded'
        const { error: paymentError } = await supabase
          .from('payments')
          .update({ status: 'succeeded', processed_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (bookingError || paymentError) {
          console.error(`Error updating database after payment for booking ${bookingId}:`, bookingError || paymentError);
        } else {
          console.log(`Successfully updated booking ${bookingId} to confirmed.`);
          
          // Send thank you email notification
          try {
            await EmailService.sendThankYouEmail(bookingId);
            console.log(`Queued thank you email for booking ${bookingId}`);
          } catch (emailError) {
            console.error(`Error queuing thank you email for booking ${bookingId}:`, emailError);
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
              console.error(`Could not fetch location_id and bay_id for booking ${bookingId} to trigger kiosk update.`, fetchError);
            } else {
              console.log(`Payment confirmed for location ${booking.location_id}, bay ${booking.bay_id}. Triggering kiosk update.`);
              await socketService.triggerBookingUpdate(booking.location_id, booking.bay_id, bookingId);
            }
          } catch (kioskError) {
            console.error(`Error triggering kiosk update for booking ${bookingId}:`, kioskError);
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

              console.log(`Booking ${bookingId} starts in ${minutesUntilStart.toFixed(1)} minutes`);

              // If booking starts within 15 minutes, send reminder email immediately
              if (minutesUntilStart <= 15) {
                console.log(`Booking ${bookingId} starts soon (${minutesUntilStart.toFixed(1)} min), sending immediate reminder`);
                
                // Generate unlock token and link (same as reminder job)
                const tokenData = {
                  bookingId,
                  startTime: bookingDetails.start_time,
                  endTime: bookingDetails.end_time,
                  expires: new Date(bookingDetails.end_time).getTime()
                };
                const unlockToken = Buffer.from(JSON.stringify(tokenData)).toString('base64');
                const unlockLink = `${process.env.FRONTEND_URL || 'https://golflabs.us'}/unlock?token=${unlockToken}`;

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
                console.log(`Sent immediate reminder email for booking ${bookingId}`);
              }
            }
          } catch (reminderError) {
            console.error(`Error handling immediate reminder for booking ${bookingId}:`, reminderError);
            // Don't fail the webhook if reminder fails
          }
        }
      } else if (event.type === 'payment_intent.canceled') {
        console.log(`Payment canceled for booking ID: ${bookingId}. Updating database...`);

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
          console.error(`Error updating database after payment cancellation for booking ${bookingId}:`, cancelBookingError || cancelPaymentError);
        } else {
          console.log(`Successfully updated booking ${bookingId} to cancelled.`);
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        console.log(`Payment failed for booking ID: ${bookingId}.`);
        // Update payment record to failed. The booking remains 'reserved' until it expires.
        const { error: paymentFailedError } = await supabase
          .from('payments')
          .update({ status: 'failed' })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (paymentFailedError) {
          console.error(`Error updating payment status to failed for booking ${bookingId}:`, paymentFailedError);
        }
      }
      break;

    // Refund webhook handlers
    case 'charge.dispute.created':
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = dispute.charge;
      console.log(`Dispute created for charge ${chargeId}. Handling dispute...`);

      // Find the payment record by charge ID (you may need to store charge_id in payments table)
      // For now, we'll log this and handle manually
      console.warn(`Dispute created for charge ${chargeId}. Manual review required.`);
      break;

    default:
      // Handle refund events that may not be in the main Stripe.Event type
      if (event.type.startsWith('refund.')) {
        const refundEvent = event as any; // Type assertion for refund events
        const refund = refundEvent.data.object as Stripe.Refund;
        const refundBookingId = refund.metadata?.booking_id;
        
        if (!refundBookingId) {
          console.warn(`Refund webhook received with no booking_id in metadata: ${refund.id}, event type: ${event.type}`);
          break;
        }

        if (event.type === 'refund.created') {
          console.log(`Refund created for booking ID: ${refundBookingId}, refund ID: ${refund.id}`);

          // Update payment record with refund information
          const { error: refundCreateError } = await supabase
            .from('payments')
            .update({ 
              status: 'refunding',
              refund_amount: refund.amount / 100, // convert cents to dollars
              refunded_at: new Date().toISOString()
            })
            .eq('booking_id', refundBookingId);

          if (refundCreateError) {
            console.error(`Error updating payment with refund info for booking ${refundBookingId}:`, refundCreateError);
          } else {
            console.log(`Successfully updated payment record with refund info for booking ${refundBookingId}`);
          }
        } else if (event.type === 'refund.updated') {
          console.log(`Refund updated for booking ID: ${refundBookingId}, status: ${refund.status}`);

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
            console.error(`Error updating payment refund status for booking ${refundBookingId}:`, refundUpdateError);
          } else {
            console.log(`Successfully updated payment refund status to ${paymentStatus} for booking ${refundBookingId}`);
          }
        } else if (event.type.includes('refund') && event.type.includes('failed')) {
          console.log(`Refund failed for booking ID: ${refundBookingId}, refund ID: ${refund.id}`);

          // Update payment status to indicate refund failed
          const { error: refundFailedError } = await supabase
            .from('payments')
            .update({ 
              status: 'refund_failed'
            })
            .eq('booking_id', refundBookingId);

          // Update the cancellation record with failure information
          const { error: cancellationUpdateError } = await supabase
            .from('bookings_cancellations')
            .update({ 
              cancellation_reason: `Refund failed: ${refund.failure_reason || 'Unknown reason'}. Manual processing required.`
            })
            .eq('booking_id', refundBookingId);

          if (refundFailedError || cancellationUpdateError) {
            console.error(`Error updating records for failed refund on booking ${refundBookingId}:`, refundFailedError || cancellationUpdateError);
          } else {
            console.log(`Updated records for failed refund on booking ${refundBookingId}`);
          }
        }
      } else {
        console.log(`Unhandled event type ${event.type}`);
      }
      break;
  }

  res.json({ received: true });
} 