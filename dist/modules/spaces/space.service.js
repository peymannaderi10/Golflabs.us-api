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
