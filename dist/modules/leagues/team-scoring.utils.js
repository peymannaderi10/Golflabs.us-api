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
exports.calculateTeamScore = calculateTeamScore;
const database_1 = require("../../config/database");
/**
 * Calculate team score for a week based on the scoring format.
 * Shared between LeagueStandingsService and LeagueTeamService.
 */
function calculateTeamScore(teamId, weekId, league) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get all team member scores for this week
        const { data: members } = yield database_1.supabase
            .from('league_players')
            .select('id, current_handicap, display_name')
            .eq('league_team_id', teamId)
            .neq('enrollment_status', 'withdrawn');
        if (!members || members.length === 0) {
            return { teamGross: 0, teamNet: 0, memberScores: [] };
        }
        const memberIds = members.map(m => m.id);
        const { data: scores } = yield database_1.supabase
            .from('league_scores')
            .select('league_player_id, hole_number, strokes')
            .eq('league_week_id', weekId)
            .in('league_player_id', memberIds)
            .order('hole_number');
        if (!scores || scores.length === 0) {
            return { teamGross: 0, teamNet: 0, memberScores: [] };
        }
        // Organize scores by hole and player
        const scoresByHole = {};
        for (const s of scores) {
            if (!scoresByHole[s.hole_number]) {
                scoresByHole[s.hole_number] = {};
            }
            scoresByHole[s.hole_number][s.league_player_id] = s.strokes;
        }
        const format = league.team_scoring_format || 'best_ball';
        let teamGross = 0;
        if (format === 'best_ball') {
            // Best score on each hole
            for (const hole of Object.keys(scoresByHole).map(Number)) {
                const holeScores = Object.values(scoresByHole[hole]);
                if (holeScores.length > 0) {
                    teamGross += Math.min(...holeScores);
                }
            }
        }
        else if (format === 'combined') {
            // Sum all member scores
            teamGross = scores.reduce((sum, s) => sum + s.strokes, 0);
        }
        else if (format === 'scramble') {
            // In a scramble, all players should have the same score per hole
            // Use the first player's scores as the team score
            const firstMemberId = memberIds[0];
            const firstMemberScores = scores.filter(s => s.league_player_id === firstMemberId);
            teamGross = firstMemberScores.reduce((sum, s) => sum + s.strokes, 0);
        }
        // For net: use average team handicap
        const avgHandicap = members.reduce((sum, m) => sum + (m.current_handicap || 0), 0) / members.length;
        const teamNet = teamGross - avgHandicap;
        // Individual member scores for display
        const memberScores = members.map(m => {
            const playerScores = scores.filter(s => s.league_player_id === m.id);
            const gross = playerScores.reduce((sum, s) => sum + s.strokes, 0);
            return {
                playerId: m.id,
                displayName: m.display_name,
                handicap: m.current_handicap,
                gross,
                net: gross - (m.current_handicap || 0),
                holesCompleted: playerScores.length,
            };
        });
        return { teamGross, teamNet: Math.round(teamNet * 10) / 10, memberScores };
    });
}
