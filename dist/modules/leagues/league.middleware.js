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
exports.validateLeagueAccess = void 0;
const database_1 = require("../../config/database");
/**
 * Middleware that verifies the league identified by :leagueId belongs to the
 * authenticated employee's location. Must be used AFTER authenticateEmployee.
 */
const validateLeagueAccess = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const accessibleIds = (_a = req.employeeProfile) === null || _a === void 0 ? void 0 : _a.accessibleLocationIds;
    if (!accessibleIds || accessibleIds.length === 0) {
        return res.status(403).json({ error: 'Employee profile missing location access' });
    }
    const { leagueId } = req.params;
    if (!leagueId) {
        return res.status(400).json({ error: 'leagueId is required' });
    }
    const { data } = yield database_1.supabase
        .from('leagues')
        .select('location_id')
        .eq('id', leagueId)
        .single();
    if (!data) {
        return res.status(404).json({ error: 'League not found' });
    }
    if (!accessibleIds.includes(data.location_id)) {
        return res.status(403).json({ error: 'Access denied: league belongs to a different location' });
    }
    next();
});
exports.validateLeagueAccess = validateLeagueAccess;
