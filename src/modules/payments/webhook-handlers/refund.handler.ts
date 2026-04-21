import Stripe from 'stripe';
import { supabase } from '../../../config/database';
import { logger } from '../../../shared/utils/logger';

/**
 * Handles `refund.created`, `refund.updated`, and `refund.failed` events.
 * Routes by metadata: booking refunds vs league enrollment refunds.
 */
export async function handleRefundEvent(event: Stripe.Event): Promise<void> {
  // Refund events aren't in the main Stripe.Event union — cast to access
  // the refund payload safely.
  const refundEvent = event as Stripe.Event & { data: { object: Stripe.Refund } };
  const refund = refundEvent.data.object;
  const refundBookingId = refund.metadata?.booking_id;
  const refundLeaguePlayerId = refund.metadata?.league_player_id;
  const refundLeagueId = refund.metadata?.league_id;

  // League enrollment refund
  if (refundLeaguePlayerId && refundLeagueId) {
    if (event.type === 'refund.created') {
      logger.info({ leaguePlayerId: refundLeaguePlayerId, leagueId: refundLeagueId, refundId: refund.id }, 'League refund created');
      const { error } = await supabase
        .from('league_players')
        .update({
          season_paid: false,
          prize_pot_paid: false,
          enrollment_status: 'withdrawn',
        })
        .eq('id', refundLeaguePlayerId);
      if (error) {
        logger.error({ err: error, leaguePlayerId: refundLeaguePlayerId }, 'Error updating league player on refund');
      }
    } else if (event.type === 'refund.updated') {
      logger.info({ leaguePlayerId: refundLeaguePlayerId, refundStatus: refund.status }, 'League refund updated');
      if (refund.status === 'succeeded') {
        const { error } = await supabase
          .from('league_players')
          .update({ enrollment_status: 'withdrawn', season_paid: false, prize_pot_paid: false })
          .eq('id', refundLeaguePlayerId);
        if (error) logger.error({ err: error, leaguePlayerId: refundLeaguePlayerId }, 'Error finalizing league refund');
      } else if (refund.status === 'failed') {
        logger.error({ leaguePlayerId: refundLeaguePlayerId }, 'League refund FAILED, manual review required');
      }
    }
    return;
  }

  // Booking refund
  if (!refundBookingId) {
    logger.warn({ refundId: refund.id, eventType: event.type }, 'Refund webhook received with no booking_id or league_player_id in metadata');
    return;
  }

  if (event.type === 'refund.created') {
    logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund created for booking');
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'refunding',
        refund_amount: refund.amount / 100,
        refunded_at: new Date().toISOString(),
      })
      .eq('booking_id', refundBookingId);
    if (error) logger.error({ err: error, bookingId: refundBookingId }, 'Error updating payment with refund info');
    return;
  }

  if (event.type === 'refund.updated') {
    logger.info({ bookingId: refundBookingId, refundStatus: refund.status }, 'Refund updated for booking');
    const paymentStatus =
      refund.status === 'succeeded' ? 'refunded'
      : refund.status === 'failed' ? 'refund_failed'
      : 'refunding';

    const { error } = await supabase
      .from('payments')
      .update({
        status: paymentStatus,
        refund_amount: refund.amount / 100,
        refunded_at: refund.status === 'succeeded' ? new Date().toISOString() : undefined,
      })
      .eq('booking_id', refundBookingId);
    if (error) logger.error({ err: error, bookingId: refundBookingId }, 'Error updating payment refund status');
    return;
  }

  if (event.type.includes('refund') && event.type.includes('failed')) {
    logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund failed for booking');

    const { error: payErr } = await supabase
      .from('payments')
      .update({ status: 'refund_failed' })
      .eq('booking_id', refundBookingId);

    const { error: cancelErr } = await supabase
      .from('booking_cancellations')
      .update({
        cancellation_reason: `Refund failed: ${refund.failure_reason || 'Unknown reason'}. Manual processing required.`,
      })
      .eq('booking_id', refundBookingId);

    if (payErr || cancelErr) {
      logger.error({ err: payErr || cancelErr, bookingId: refundBookingId }, 'Error updating records for failed refund');
    }
  }
}

/** Handles `charge.dispute.created` events. Logs for manual review. */
export function handleDisputeCreated(dispute: Stripe.Dispute): void {
  const chargeId = dispute.charge;
  logger.warn({ chargeId, disputeId: dispute.id }, 'Dispute created, manual review required');
}
