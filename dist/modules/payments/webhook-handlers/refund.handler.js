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
exports.handleRefundEvent = handleRefundEvent;
exports.handleDisputeCreated = handleDisputeCreated;
const database_1 = require("../../../config/database");
const logger_1 = require("../../../shared/utils/logger");
/**
 * Handles `refund.created`, `refund.updated`, and `refund.failed` events.
 * Routes by metadata: booking refunds vs league enrollment refunds.
 */
function handleRefundEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        // Refund events aren't in the main Stripe.Event union — cast to access
        // the refund payload safely.
        const refundEvent = event;
        const refund = refundEvent.data.object;
        const refundBookingId = (_a = refund.metadata) === null || _a === void 0 ? void 0 : _a.booking_id;
        const refundLeaguePlayerId = (_b = refund.metadata) === null || _b === void 0 ? void 0 : _b.league_player_id;
        const refundLeagueId = (_c = refund.metadata) === null || _c === void 0 ? void 0 : _c.league_id;
        // League enrollment refund
        if (refundLeaguePlayerId && refundLeagueId) {
            if (event.type === 'refund.created') {
                logger_1.logger.info({ leaguePlayerId: refundLeaguePlayerId, leagueId: refundLeagueId, refundId: refund.id }, 'League refund created');
                const { error } = yield database_1.supabase
                    .from('league_players')
                    .update({
                    season_paid: false,
                    prize_pot_paid: false,
                    enrollment_status: 'withdrawn',
                })
                    .eq('id', refundLeaguePlayerId);
                if (error) {
                    logger_1.logger.error({ err: error, leaguePlayerId: refundLeaguePlayerId }, 'Error updating league player on refund');
                }
            }
            else if (event.type === 'refund.updated') {
                logger_1.logger.info({ leaguePlayerId: refundLeaguePlayerId, refundStatus: refund.status }, 'League refund updated');
                if (refund.status === 'succeeded') {
                    const { error } = yield database_1.supabase
                        .from('league_players')
                        .update({ enrollment_status: 'withdrawn', season_paid: false, prize_pot_paid: false })
                        .eq('id', refundLeaguePlayerId);
                    if (error)
                        logger_1.logger.error({ err: error, leaguePlayerId: refundLeaguePlayerId }, 'Error finalizing league refund');
                }
                else if (refund.status === 'failed') {
                    logger_1.logger.error({ leaguePlayerId: refundLeaguePlayerId }, 'League refund FAILED, manual review required');
                }
            }
            return;
        }
        // Booking refund
        if (!refundBookingId) {
            logger_1.logger.warn({ refundId: refund.id, eventType: event.type }, 'Refund webhook received with no booking_id or league_player_id in metadata');
            return;
        }
        if (event.type === 'refund.created') {
            logger_1.logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund created for booking');
            const { error } = yield database_1.supabase
                .from('payments')
                .update({
                status: 'refunding',
                refund_amount: refund.amount / 100,
                refunded_at: new Date().toISOString(),
            })
                .eq('booking_id', refundBookingId);
            if (error)
                logger_1.logger.error({ err: error, bookingId: refundBookingId }, 'Error updating payment with refund info');
            return;
        }
        if (event.type === 'refund.updated') {
            logger_1.logger.info({ bookingId: refundBookingId, refundStatus: refund.status }, 'Refund updated for booking');
            const paymentStatus = refund.status === 'succeeded' ? 'refunded'
                : refund.status === 'failed' ? 'refund_failed'
                    : 'refunding';
            const { error } = yield database_1.supabase
                .from('payments')
                .update({
                status: paymentStatus,
                refund_amount: refund.amount / 100,
                refunded_at: refund.status === 'succeeded' ? new Date().toISOString() : undefined,
            })
                .eq('booking_id', refundBookingId);
            if (error)
                logger_1.logger.error({ err: error, bookingId: refundBookingId }, 'Error updating payment refund status');
            return;
        }
        if (event.type.includes('refund') && event.type.includes('failed')) {
            logger_1.logger.info({ bookingId: refundBookingId, refundId: refund.id }, 'Refund failed for booking');
            const { error: payErr } = yield database_1.supabase
                .from('payments')
                .update({ status: 'refund_failed' })
                .eq('booking_id', refundBookingId);
            const { error: cancelErr } = yield database_1.supabase
                .from('booking_cancellations')
                .update({
                cancellation_reason: `Refund failed: ${refund.failure_reason || 'Unknown reason'}. Manual processing required.`,
            })
                .eq('booking_id', refundBookingId);
            if (payErr || cancelErr) {
                logger_1.logger.error({ err: payErr || cancelErr, bookingId: refundBookingId }, 'Error updating records for failed refund');
            }
        }
    });
}
/** Handles `charge.dispute.created` events. Logs for manual review. */
function handleDisputeCreated(dispute) {
    const chargeId = dispute.charge;
    logger_1.logger.warn({ chargeId, disputeId: dispute.id }, 'Dispute created, manual review required');
}
