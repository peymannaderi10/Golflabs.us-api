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
                console.error('Error handling expired reservations:', error);
                return;
            }
            console.log('Checked for expired reservations');
        }
        catch (error) {
            console.error('Error in handleExpiredReservations:', error);
        }
    });
}
