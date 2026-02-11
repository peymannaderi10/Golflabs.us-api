"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHandicap = calculateHandicap;
exports.calculateNetScore = calculateNetScore;
exports.calculateDifferential = calculateDifferential;
exports.calculateDifferentialFromPar = calculateDifferentialFromPar;
/**
 * Simplified indoor sim handicap calculation.
 *
 * Differential = gross_score - (num_holes * par_per_hole)
 * Handicap = average of best N differentials from last M rounds * 0.96
 *
 * @param roundDifferentials Array of differentials (gross - par) for each round played
 * @param bestOf Number of best rounds to use (default 8)
 * @param window Number of most recent rounds to consider (default 20)
 * @returns The calculated handicap rounded to 1 decimal place
 */
function calculateHandicap(roundDifferentials, bestOf = 8, window = 20) {
    if (roundDifferentials.length === 0)
        return 0;
    // Take only the most recent rounds within the window
    const recent = roundDifferentials.slice(-window);
    // Sort ascending to pick the best (lowest) differentials
    const sorted = [...recent].sort((a, b) => a - b);
    // Take the best N (or fewer if not enough rounds played)
    const best = sorted.slice(0, Math.min(bestOf, sorted.length));
    if (best.length === 0)
        return 0;
    // Average the best differentials and apply the 0.96 multiplier
    const avg = best.reduce((a, b) => a + b, 0) / best.length;
    const handicap = avg * 0.96;
    // Round to 1 decimal place, minimum 0
    return Math.max(0, Math.round(handicap * 10) / 10);
}
/**
 * Calculate the net score for a round given gross score and handicap.
 *
 * @param grossScore Total strokes for the round
 * @param handicap Player's current handicap
 * @returns Net score (gross - handicap), rounded to 1 decimal
 */
function calculateNetScore(grossScore, handicap) {
    return Math.round((grossScore - handicap) * 10) / 10;
}
/**
 * Calculate the differential for a single round.
 *
 * @param grossScore Total strokes for the round
 * @param numHoles Number of holes played
 * @param parPerHole Par value per hole
 * @returns The differential (gross - total_par)
 */
function calculateDifferential(grossScore, numHoles, parPerHole) {
    const totalPar = numHoles * parPerHole;
    return grossScore - totalPar;
}
/**
 * Calculate the differential using the actual course total par.
 * Preferred over calculateDifferential when per-hole par data is available.
 *
 * @param grossScore Total strokes for the round
 * @param totalPar Total par for the course (sum of all hole pars)
 * @returns The differential (gross - total_par)
 */
function calculateDifferentialFromPar(grossScore, totalPar) {
    return grossScore - totalPar;
}
