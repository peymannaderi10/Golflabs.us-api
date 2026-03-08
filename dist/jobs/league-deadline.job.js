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
exports.processTeamDeadlines = processTeamDeadlines;
const league_service_1 = require("../modules/leagues/league.service");
const logger_1 = require("../shared/utils/logger");
const leagueService = new league_service_1.LeagueService();
/**
 * Scheduled job: Process team league deadlines.
 *
 * Runs every 5 minutes and checks for team leagues where:
 * - The league start time has passed
 * - Teams still have unpaid members
 *
 * Unpaid teams are automatically disqualified and paid members are refunded.
 */
function processTeamDeadlines() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield leagueService.processTeamDeadlines();
            if (result.disqualified.length > 0) {
                logger_1.logger.info({ count: result.disqualified.length, disqualified: result.disqualified }, 'Disqualified teams');
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error }, 'Error processing team deadlines');
        }
    });
}
