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
exports.authenticateEmployee = void 0;
const database_1 = require("../../config/database");
const authenticateEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        const { data: { user }, error } = yield database_1.supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        // Check if user is an employee
        const { data: profile, error: profileError } = yield database_1.supabase
            .from('user_profiles')
            .select('id, email, full_name, role')
            .eq('id', user.id)
            .single();
        if (profileError || !profile) {
            return res.status(401).json({ error: 'User profile not found' });
        }
        if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
            return res.status(403).json({ error: 'Employee access required' });
        }
        req.user = user;
        req.employeeProfile = profile;
        next();
    }
    catch (error) {
        console.error('Employee authentication error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
});
exports.authenticateEmployee = authenticateEmployee;
