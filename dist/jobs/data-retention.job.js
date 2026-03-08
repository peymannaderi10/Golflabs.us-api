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
exports.enforceDataRetention = enforceDataRetention;
const database_1 = require("../config/database");
const logger_1 = require("../shared/utils/logger");
/**
 * Enforces data retention policies:
 * - Access logs: delete entries older than 90 days
 * - Notifications: delete entries older than 90 days
 * - Bookings: anonymize user_id on records older than 7 years
 *
 * Runs once daily.
 */
function enforceDataRetention() {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const sevenYearsAgo = new Date(now);
        sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
        try {
            const { count: logsDeleted } = yield database_1.supabase
                .from('access_logs')
                .delete({ count: 'exact' })
                .lt('created_at', ninetyDaysAgo.toISOString());
            const { count: notificationsDeleted } = yield database_1.supabase
                .from('notifications')
                .delete({ count: 'exact' })
                .lt('created_at', ninetyDaysAgo.toISOString());
            const { count: bookingsAnonymized } = yield database_1.supabase
                .from('bookings')
                .update({ user_id: null, notes: null })
                .not('user_id', 'is', null)
                .lt('created_at', sevenYearsAgo.toISOString());
            logger_1.logger.info({ logsDeleted, notificationsDeleted, bookingsAnonymized }, 'Data retention job completed');
        }
        catch (error) {
            logger_1.logger.error({ err: error }, 'Data retention job failed');
        }
    });
}
