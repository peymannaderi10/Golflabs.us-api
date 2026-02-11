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
exports.recalculateAllHandicaps = recalculateAllHandicaps;
const database_1 = require("../config/database");
const league_service_1 = require("../modules/leagues/league.service");
/**
 * Handicap Recalculation Job
 *
 * This job recalculates handicaps for all active leagues.
 * It is designed to be triggered on-demand after a week is finalized
 * (see LeagueService.finalizeWeek), but can also be run on a schedule
 * as a safety net.
 *
 * The primary trigger path is:
 *   1. Employee clicks "Finalize Week" in dashboard
 *   2. LeagueController.finalizeWeek -> LeagueService.finalizeWeek
 *   3. finalizeWeek calls recalculateHandicaps internally
 *
 * This scheduled job serves as a backup to catch any missed recalculations.
 */
function recalculateAllHandicaps() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('[Handicap Job] Starting handicap recalculation for all active leagues...');
        try {
            const leagueService = new league_service_1.LeagueService();
            // Find all active leagues with handicaps enabled
            const { data: activeLeagues, error } = yield database_1.supabase
                .from('leagues')
                .select('id, name')
                .eq('status', 'active')
                .eq('handicap_enabled', true);
            if (error) {
                console.error('[Handicap Job] Failed to fetch active leagues:', error);
                return;
            }
            if (!activeLeagues || activeLeagues.length === 0) {
                console.log('[Handicap Job] No active leagues with handicaps enabled. Skipping.');
                return;
            }
            for (const league of activeLeagues) {
                try {
                    yield leagueService.recalculateHandicaps(league.id);
                    console.log(`[Handicap Job] Recalculated handicaps for league: ${league.name} (${league.id})`);
                }
                catch (leagueError) {
                    console.error(`[Handicap Job] Error recalculating handicaps for league ${league.name}:`, leagueError.message);
                }
            }
            console.log(`[Handicap Job] Completed. Processed ${activeLeagues.length} league(s).`);
        }
        catch (error) {
            console.error('[Handicap Job] Unexpected error:', error.message);
        }
    });
}
