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
exports.handleExpiredReservations = handleExpiredReservations;
const database_1 = require("../config/database");
const logger_1 = require("../shared/utils/logger");
// Function to handle expired reservations
function handleExpiredReservations() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const now = new Date().toISOString();
            const { error } = yield database_1.supabase
                .from('bookings')
                .update({ status: 'expired' })
                .lt('expires_at', now)
                .eq('status', 'reserved');
            if (error) {
                logger_1.logger.error({ err: error }, 'Error handling expired reservations');
                return;
            }
            logger_1.logger.info('Checked for expired reservations');
            // Clean up orphaned pending bookings (reservation holds off) older than 30 minutes.
            // These are created when a customer enters checkout without a reservation hold
            // and never completes payment.
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            const { error: pendingError } = yield database_1.supabase
                .from('bookings')
                .update({ status: 'abandoned' })
                .eq('status', 'pending')
                .is('expires_at', null)
                .lt('created_at', thirtyMinAgo);
            if (pendingError) {
                logger_1.logger.error({ err: pendingError }, 'Error cleaning up orphaned pending bookings');
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error }, 'Error in handleExpiredReservations');
        }
    });
}
