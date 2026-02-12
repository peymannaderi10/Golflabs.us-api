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
exports.CapacityHoldService = void 0;
const database_1 = require("../../config/database");
class CapacityHoldService {
    /**
     * Generate capacity holds for all weeks of a league.
     * Called when a league is created.
     */
    generateHoldsForLeague(leagueId, locationId, startTime, endTime, weeks, config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (weeks.length === 0)
                return;
            const rows = weeks.map(week => ({
                league_id: leagueId,
                league_week_id: week.id,
                location_id: locationId,
                hold_date: week.date,
                start_time: startTime,
                end_time: endTime,
                hold_type: config.holdType,
                hold_value: config.holdValue,
                buffer_before_mins: config.bufferBeforeMins,
                buffer_after_mins: config.bufferAfterMins,
                status: 'active',
            }));
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .insert(rows);
            if (error) {
                console.error('Failed to generate capacity holds:', error);
                throw new Error(`Failed to generate capacity holds: ${error.message}`);
            }
            console.log(`Generated ${rows.length} capacity holds for league ${leagueId}`);
        });
    }
    /**
     * Release all holds for a league (when cancelled).
     */
    releaseHoldsForLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({ status: 'released', updated_at: new Date().toISOString() })
                .eq('league_id', leagueId)
                .eq('status', 'active');
            if (error) {
                console.error('Failed to release holds for league:', error);
                throw new Error(`Failed to release holds: ${error.message}`);
            }
        });
    }
    /**
     * Suspend a single hold (e.g. holiday skip).
     */
    suspendHold(holdId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({ status: 'suspended', updated_at: new Date().toISOString() })
                .eq('id', holdId);
            if (error) {
                throw new Error(`Failed to suspend hold: ${error.message}`);
            }
        });
    }
    /**
     * Re-activate a suspended hold.
     */
    activateHold(holdId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({ status: 'active', updated_at: new Date().toISOString() })
                .eq('id', holdId);
            if (error) {
                throw new Error(`Failed to activate hold: ${error.message}`);
            }
        });
    }
    /**
     * Get active holds for a specific date and location.
     * Used by the booking engine to check availability.
     */
    getHoldsForDate(locationId, date) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('capacity_holds')
                .select('*, leagues(name)')
                .eq('location_id', locationId)
                .eq('hold_date', date)
                .eq('status', 'active');
            if (error) {
                console.error('Failed to fetch capacity holds:', error);
                return [];
            }
            return (data || []).map((h) => {
                var _a;
                return (Object.assign(Object.assign({}, h), { league_name: ((_a = h.leagues) === null || _a === void 0 ? void 0 : _a.name) || undefined }));
            });
        });
    }
    /**
     * Get all holds for a league (admin view).
     */
    getHoldsForLeague(leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('capacity_holds')
                .select('*')
                .eq('league_id', leagueId)
                .order('hold_date');
            if (error) {
                throw new Error(`Failed to fetch holds for league: ${error.message}`);
            }
            return data || [];
        });
    }
    /**
     * Update the hold configuration for all future active holds of a league.
     */
    updateHoldConfig(leagueId, config) {
        return __awaiter(this, void 0, void 0, function* () {
            const today = new Date().toISOString().split('T')[0];
            const { error } = yield database_1.supabase
                .from('capacity_holds')
                .update({
                hold_type: config.holdType,
                hold_value: config.holdValue,
                buffer_before_mins: config.bufferBeforeMins,
                buffer_after_mins: config.bufferAfterMins,
                updated_at: new Date().toISOString(),
            })
                .eq('league_id', leagueId)
                .eq('status', 'active')
                .gte('hold_date', today);
            if (error) {
                throw new Error(`Failed to update hold config: ${error.message}`);
            }
        });
    }
    /**
     * Check if a requested booking time overlaps with any active capacity hold.
     * Returns the hold if blocked, null if booking is allowed.
     *
     * @param locationId  Location UUID
     * @param date        YYYY-MM-DD
     * @param startTime   HH:MM (24h) of the booking start
     * @param endTime     HH:MM (24h) of the booking end
     * @param totalBays   Total number of bays at the location (for num_bays / pct_capacity)
     * @param existingBookingsInWindow  Count of non-league bookings already in this window
     */
    checkHoldConflict(locationId_1, date_1, startTime_1, endTime_1, totalBays_1) {
        return __awaiter(this, arguments, void 0, function* (locationId, date, startTime, endTime, totalBays, existingBookingsInWindow = 0) {
            const holds = yield this.getHoldsForDate(locationId, date);
            for (const hold of holds) {
                // Calculate effective hold window with buffers
                const holdStart = this.subtractMinutes(hold.start_time, hold.buffer_before_mins);
                const holdEnd = this.addMinutes(hold.end_time, hold.buffer_after_mins);
                // Check overlap: booking overlaps hold if booking_start < hold_end AND booking_end > hold_start
                if (startTime < holdEnd && endTime > holdStart) {
                    // Determine if this hold blocks the booking
                    if (hold.hold_type === 'all_bays') {
                        return hold; // All bays blocked
                    }
                    if (hold.hold_type === 'num_bays') {
                        // hold_value = number of bays reserved for league
                        const publicBaysAvailable = totalBays - hold.hold_value;
                        if (existingBookingsInWindow >= publicBaysAvailable) {
                            return hold; // No more public bays available
                        }
                    }
                    if (hold.hold_type === 'pct_capacity') {
                        // hold_value = percentage of bays reserved (e.g. 75)
                        const reservedBays = Math.ceil(totalBays * (hold.hold_value / 100));
                        const publicBaysAvailable = totalBays - reservedBays;
                        if (existingBookingsInWindow >= publicBaysAvailable) {
                            return hold;
                        }
                    }
                }
            }
            return null; // No conflict
        });
    }
    /**
     * Get today's active hold for a location (for dashboard "League Night" detection).
     */
    getTodaysHold(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const today = new Date().toISOString().split('T')[0];
            const holds = yield this.getHoldsForDate(locationId, today);
            return holds.length > 0 ? holds[0] : null;
        });
    }
    // --- Helpers ---
    subtractMinutes(time, minutes) {
        if (minutes <= 0)
            return time;
        const [h, m] = time.split(':').map(Number);
        const totalMins = h * 60 + m - minutes;
        const newH = Math.max(0, Math.floor(totalMins / 60));
        const newM = Math.max(0, totalMins % 60);
        return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    }
    addMinutes(time, minutes) {
        if (minutes <= 0)
            return time;
        const [h, m] = time.split(':').map(Number);
        const totalMins = h * 60 + m + minutes;
        const newH = Math.min(23, Math.floor(totalMins / 60));
        const newM = totalMins % 60;
        return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    }
}
exports.CapacityHoldService = CapacityHoldService;
