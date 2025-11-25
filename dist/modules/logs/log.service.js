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
exports.LogService = void 0;
const database_1 = require("../../config/database");
class LogService {
    createAccessLog(logData) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!logData.bay_id || !logData.action) {
                throw new Error('Bay ID and action are required for access logs');
            }
            // If booking_id is provided but user_id is not, look up the user_id from the booking
            let enrichedLogData = Object.assign({}, logData);
            if (logData.booking_id && !logData.user_id) {
                try {
                    const { data: booking } = yield database_1.supabase
                        .from('bookings')
                        .select('user_id, location_id')
                        .eq('id', logData.booking_id)
                        .single();
                    if (booking) {
                        enrichedLogData.user_id = booking.user_id;
                        // Also fill in location_id if not provided
                        if (!enrichedLogData.location_id) {
                            enrichedLogData.location_id = booking.location_id;
                        }
                    }
                }
                catch (lookupError) {
                    console.warn('Could not look up user_id from booking:', lookupError);
                    // Continue without the user_id - don't fail the log creation
                }
            }
            const { data, error } = yield database_1.supabase
                .from('access_logs')
                .insert(Object.assign(Object.assign({}, enrichedLogData), { timestamp: new Date().toISOString() }))
                .select()
                .single();
            if (error) {
                console.error('Error creating access log:', error);
                throw new Error('Failed to create access log');
            }
            return data;
        });
    }
}
exports.LogService = LogService;
