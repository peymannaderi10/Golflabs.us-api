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
exports.autoDeactivateLeagueMode = autoDeactivateLeagueMode;
const database_1 = require("../config/database");
const logger_1 = require("../shared/utils/logger");
/**
 * Auto-deactivate league mode on spaces after the league's end time + buffer.
 *
 * Checks all spaces where league_mode_active = true, looks up the associated
 * league's end_time and buffer_after_mins, and deactivates if the current
 * time has passed the league end time + buffer.
 */
function autoDeactivateLeagueMode() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Find all spaces that are currently in league mode
            const { data: activeSpaces, error: spacesError } = yield database_1.supabase
                .from('spaces')
                .select('id, location_id, league_mode_league_id')
                .eq('league_mode_active', true)
                .not('league_mode_league_id', 'is', null);
            if (spacesError || !activeSpaces || activeSpaces.length === 0) {
                return; // No active league mode spaces
            }
            // Get unique league IDs
            const leagueIds = [...new Set(activeSpaces.map(b => b.league_mode_league_id).filter(Boolean))];
            if (leagueIds.length === 0)
                return;
            // Fetch league details
            const { data: leagues, error: leaguesError } = yield database_1.supabase
                .from('leagues')
                .select('id, end_time, buffer_after_mins, location_id')
                .in('id', leagueIds);
            if (leaguesError || !leagues) {
                logger_1.logger.error({ err: leaguesError }, 'Auto-deactivate: Failed to fetch leagues');
                return;
            }
            const now = new Date();
            for (const league of leagues) {
                // Parse the league end time (stored as HH:MM)
                const [endHour, endMin] = (league.end_time || '21:00').split(':').map(Number);
                const bufferMins = league.buffer_after_mins || 0;
                // Calculate the deactivation time for today
                const deactivateTime = new Date();
                deactivateTime.setHours(endHour, endMin + bufferMins, 0, 0);
                if (now > deactivateTime) {
                    // Current time is past the league end + buffer, deactivate
                    logger_1.logger.info({ leagueId: league.id, locationId: league.location_id, endTime: league.end_time, bufferMins }, 'Auto-deactivating league mode');
                    const { error: updateError } = yield database_1.supabase
                        .from('spaces')
                        .update({
                        league_mode_active: false,
                        league_mode_league_id: null,
                        updated_at: now.toISOString(),
                    })
                        .eq('league_mode_league_id', league.id);
                    if (updateError) {
                        logger_1.logger.error({ err: updateError, leagueId: league.id }, 'Auto-deactivate: Failed to update spaces');
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error }, 'Auto-deactivate league mode job error');
        }
    });
}
