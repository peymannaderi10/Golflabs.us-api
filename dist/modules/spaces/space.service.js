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
exports.SpaceService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
class SpaceService {
    getSpaceLocationId(spaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data } = yield database_1.supabase
                .from('spaces')
                .select('location_id')
                .eq('id', spaceId)
                .single();
            return (_a = data === null || data === void 0 ? void 0 : data.location_id) !== null && _a !== void 0 ? _a : null;
        });
    }
    createSpace(locationId, name, spaceNumber, equipment) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!locationId || !name || spaceNumber === undefined) {
                throw new Error('Location ID, name, and space number are required');
            }
            const { data: existing } = yield database_1.supabase
                .from('spaces')
                .select('id')
                .eq('location_id', locationId)
                .eq('space_number', spaceNumber)
                .is('deleted_at', null)
                .single();
            if (existing) {
                throw new Error(`Space number ${spaceNumber} already exists at this location`);
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .insert({
                location_id: locationId,
                name,
                space_number: spaceNumber,
                equipment_type: equipment || 'Golf Simulator',
                status: 'available',
                league_mode_active: false,
            })
                .select('id, status, location_id, space_number, name, equipment_type, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error creating space');
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('free_tier_space_limit_reached')) {
                    const err = new Error('Your free plan is limited to 4 spaces per location. Upgrade to add more.');
                    err.statusCode = 402;
                    throw err;
                }
                throw new Error('Failed to create space');
            }
            return data;
        });
    }
    deleteSpace(spaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!spaceId) {
                throw new Error('Space ID is required');
            }
            // Soft delete: set deleted_at timestamp
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', spaceId)
                .is('deleted_at', null)
                .select('id, location_id')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error deleting space');
                throw new Error('Failed to delete space');
            }
            if (!data) {
                throw new Error(`Space with ID ${spaceId} not found or already deleted`);
            }
            return { success: true, locationId: data.location_id };
        });
    }
    getSpacesByLocationId(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .select('id, status, location_id, space_number, name, last_seen, kiosk_ip, league_mode_active, league_mode_league_id')
                .eq('location_id', locationId)
                .is('deleted_at', null);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching spaces');
                throw new Error('Failed to fetch spaces');
            }
            return data;
        });
    }
    updateSpaceHeartbeat(spaceId, kioskIp) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!spaceId) {
                throw new Error('Space ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .update({
                last_seen: new Date().toISOString(),
                kiosk_ip: kioskIp
            })
                .eq('id', spaceId)
                .select('id, last_seen, kiosk_ip, location_id, space_number, name, status, league_mode_active, league_mode_league_id')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error updating space heartbeat');
                throw new Error('Failed to update space heartbeat');
            }
            if (!data) {
                throw new Error(`Space with ID ${spaceId} not found.`);
            }
            return data;
        });
    }
    // Add: Update space status
    updateSpaceStatus(spaceId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!spaceId) {
                throw new Error('Space ID is required');
            }
            if (!['available', 'closed'].includes(status)) {
                throw new Error('Invalid status. Must be "available" or "closed".');
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .update({
                status,
                updated_at: new Date().toISOString()
            })
                .eq('id', spaceId)
                .select('id, status, space_number, name, location_id')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error updating space status');
                throw new Error('Failed to update space status');
            }
            if (!data) {
                throw new Error(`Space with ID ${spaceId} not found.`);
            }
            return data;
        });
    }
    // =====================================================
    // SPACE CLOSURES
    // =====================================================
    getClosures(spaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('space_closures')
                .select('*')
                .eq('space_id', spaceId)
                .order('created_at', { ascending: false });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching space closures');
                throw new Error('Failed to fetch space closures');
            }
            return data || [];
        });
    }
    getClosuresByLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('space_closures')
                .select('*')
                .eq('location_id', locationId)
                .order('created_at', { ascending: false });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching location closures');
                throw new Error('Failed to fetch location closures');
            }
            return data || [];
        });
    }
    createClosure(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { spaceId, locationId, closureType, dates, recurringDays, startDate, endDate, startTime, endTime, reason, createdBy } = params;
            // Insert the closure row first
            const { data, error } = yield database_1.supabase
                .from('space_closures')
                .insert({
                space_id: spaceId,
                location_id: locationId,
                closure_type: closureType,
                dates: dates || null,
                recurring_days: recurringDays || null,
                start_date: startDate || null,
                end_date: endDate || null,
                start_time: startTime || null,
                end_time: endTime || null,
                reason: reason || null,
                created_by: createdBy,
            })
                .select('*')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error creating space closure');
                throw new Error('Failed to create space closure');
            }
            // Only after successful insert, set spaces.status to 'closed' for indefinite closures
            if (closureType === 'indefinite') {
                yield this.updateSpaceStatus(spaceId, 'closed');
            }
            return data;
        });
    }
    getClosureById(closureId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('space_closures')
                .select('*')
                .eq('id', closureId)
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching closure by ID');
                return null;
            }
            return data;
        });
    }
    deleteClosure(closureId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get the closure first to check if it's indefinite
            const { data: closure } = yield database_1.supabase
                .from('space_closures')
                .select('id, space_id, closure_type')
                .eq('id', closureId)
                .single();
            if (!closure) {
                throw new Error('Closure not found');
            }
            // Count remaining indefinite closures (excluding this one) BEFORE deleting
            let shouldReopenSpace = false;
            if (closure.closure_type === 'indefinite') {
                const { count } = yield database_1.supabase
                    .from('space_closures')
                    .select('id', { count: 'exact', head: true })
                    .eq('space_id', closure.space_id)
                    .eq('closure_type', 'indefinite')
                    .neq('id', closureId);
                shouldReopenSpace = (count !== null && count !== void 0 ? count : 0) === 0;
            }
            const { error } = yield database_1.supabase
                .from('space_closures')
                .delete()
                .eq('id', closureId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error deleting space closure');
                throw new Error('Failed to delete space closure');
            }
            // If this was the last indefinite closure, reopen the space
            if (shouldReopenSpace) {
                yield this.updateSpaceStatus(closure.space_id, 'available');
            }
            return { success: true, spaceId: closure.space_id };
        });
    }
    getActiveClosuresForSlot(spaceId, bookingDate, startTime, endTime) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if any closure applies to this slot
            const { data: closures } = yield database_1.supabase
                .from('space_closures')
                .select('*')
                .eq('space_id', spaceId);
            if (!closures || closures.length === 0)
                return false;
            const dateStr = bookingDate.split('T')[0]; // YYYY-MM-DD
            const { prevDateStr, todayDow, prevDow } = this.getDateContext(dateStr);
            for (const c of closures) {
                if (c.closure_type === 'indefinite')
                    return true;
                // 1) Does the closure apply natively on the booking's date?
                if (this.closureAppliesOnDate(c, dateStr, todayDow)) {
                    if (!c.start_time || !c.end_time)
                        return true; // all-day closure
                    // Overnight closures: on the native day, only the head [start_time, 24:00) applies
                    const windowEnd = c.end_time < c.start_time ? '24:00' : c.end_time;
                    if (startTime < windowEnd && endTime > c.start_time)
                        return true;
                }
                // 2) Overnight tail from the previous day leaking into the booking's date
                //    Only closures with a timed window where end_time < start_time produce a tail
                if (c.start_time && c.end_time && c.end_time < c.start_time) {
                    if (this.closureAppliesOnDate(c, prevDateStr, prevDow)) {
                        // Tail window on today is [00:00, c.end_time)
                        if (startTime < c.end_time)
                            return true;
                    }
                }
            }
            return false;
        });
    }
    /**
     * Returns whether a closure row is natively active on the given calendar date.
     * "Natively" means this is the day the closure's start_time is anchored to —
     * overnight tails are handled separately by the caller.
     */
    closureAppliesOnDate(c, dateStr, dayOfWeek) {
        var _a, _b, _c, _d;
        switch (c.closure_type) {
            case 'indefinite':
                return true;
            case 'dates':
                return !!((_a = c.dates) === null || _a === void 0 ? void 0 : _a.includes(dateStr));
            case 'recurring':
                if (!((_b = c.recurring_days) === null || _b === void 0 ? void 0 : _b.includes(dayOfWeek)))
                    return false;
                if (c.start_date && dateStr < c.start_date)
                    return false;
                if (c.end_date && dateStr > c.end_date)
                    return false;
                return true;
            case 'range':
                return !!(c.start_date && c.end_date && dateStr >= c.start_date && dateStr <= c.end_date);
            case 'hours': {
                if ((_c = c.dates) === null || _c === void 0 ? void 0 : _c.includes(dateStr))
                    return true;
                if ((_d = c.recurring_days) === null || _d === void 0 ? void 0 : _d.includes(dayOfWeek)) {
                    if ((!c.start_date || dateStr >= c.start_date) && (!c.end_date || dateStr <= c.end_date))
                        return true;
                }
                if (c.start_date && c.end_date && dateStr >= c.start_date && dateStr <= c.end_date)
                    return true;
                return false;
            }
            default:
                return false;
        }
    }
    getDateContext(dateStr) {
        // Parse as UTC noon to avoid DST / timezone edge cases when stepping back a day
        const today = new Date(`${dateStr}T12:00:00Z`);
        const todayDow = today.getUTCDay();
        const prev = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const prevDateStr = prev.toISOString().split('T')[0];
        const prevDow = prev.getUTCDay();
        return { prevDateStr, todayDow, prevDow };
    }
    // =====================================================
    // LEAGUE MODE
    // =====================================================
    /**
     * Bulk activate league mode for all spaces at a location.
     */
    activateLeagueMode(locationId, leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId || !leagueId) {
                throw new Error('Location ID and League ID are required');
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .update({
                league_mode_active: true,
                league_mode_league_id: leagueId,
                updated_at: new Date().toISOString(),
            })
                .eq('location_id', locationId)
                .select('id, space_number, name, league_mode_active, league_mode_league_id');
            if (error) {
                logger_1.logger.error({ err: error }, 'Error activating league mode');
                throw new Error('Failed to activate league mode');
            }
            return data;
        });
    }
    /**
     * Bulk deactivate league mode for all spaces at a location.
     */
    deactivateLeagueMode(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .update({
                league_mode_active: false,
                league_mode_league_id: null,
                updated_at: new Date().toISOString(),
            })
                .eq('location_id', locationId)
                .select('id, space_number, name, league_mode_active, league_mode_league_id');
            if (error) {
                logger_1.logger.error({ err: error }, 'Error deactivating league mode');
                throw new Error('Failed to deactivate league mode');
            }
            return data;
        });
    }
    /**
     * Toggle league mode for a single space.
     */
    toggleSpaceLeagueMode(spaceId, active, leagueId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!spaceId) {
                throw new Error('Space ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('spaces')
                .update({
                league_mode_active: active,
                league_mode_league_id: active ? leagueId : null,
                updated_at: new Date().toISOString(),
            })
                .eq('id', spaceId)
                .select('id, space_number, name, league_mode_active, league_mode_league_id, location_id')
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error toggling space league mode');
                throw new Error('Failed to toggle space league mode');
            }
            if (!data) {
                throw new Error(`Space with ID ${spaceId} not found.`);
            }
            return data;
        });
    }
}
exports.SpaceService = SpaceService;
