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
exports.PricingService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
// ── Overlap detection helpers ──
const ALL_DAYS = ['1', '2', '3', '4', '5', '6', '7'];
const MINUTES_IN_DAY = 1440;
function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}
/**
 * Expand a time range into one or two [start, end) segments within 0-1440.
 * Handles wrapping ranges like 09:00-02:00 (covers 9am→midnight + midnight→2am).
 */
function timeSegments(start, end) {
    if (!start || !end)
        return [[0, MINUTES_IN_DAY]];
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s === e)
        return [[0, MINUTES_IN_DAY]];
    if (s < e)
        return [[s, e]];
    return [[s, MINUTES_IN_DAY], [0, e]];
}
function segmentsOverlap(a, b) {
    for (const [a1, a2] of a) {
        for (const [b1, b2] of b) {
            if (a1 < b2 && b1 < a2)
                return true;
        }
    }
    return false;
}
function daysOverlap(d1, d2) {
    const set = new Set(d1.map(String));
    return d2.some(d => set.has(String(d)));
}
/**
 * Check whether a proposed rule's time/days overlap with any existing rule
 * in the same (location, user_type, is_extension_rate) group.
 * Returns the name of the conflicting rule, or null if no conflict.
 */
function findOverlap(locationId, userType, isExtensionRate, startTime, endTime, daysOfWeek, excludeRuleId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        let query = database_1.supabase
            .from('pricing_rules')
            .select('id, name, start_time, end_time, days_of_week')
            .eq('location_id', locationId)
            .eq('user_type', userType)
            .eq('is_extension_rate', isExtensionRate)
            .eq('is_active', true);
        if (excludeRuleId) {
            query = query.neq('id', excludeRuleId);
        }
        const { data: existing, error } = yield query;
        if (error || !existing)
            return null;
        const newDays = daysOfWeek.length > 0 ? daysOfWeek : ALL_DAYS;
        const newSegs = timeSegments(startTime, endTime);
        for (const rule of existing) {
            const ruleDays = ((_a = rule.days_of_week) === null || _a === void 0 ? void 0 : _a.length) > 0 ? rule.days_of_week : ALL_DAYS;
            if (!daysOverlap(newDays, ruleDays))
                continue;
            const ruleSegs = timeSegments(rule.start_time, rule.end_time);
            if (segmentsOverlap(newSegs, ruleSegs)) {
                return rule.name;
            }
        }
        return null;
    });
}
// ── Mapping helper ──
function mapRow(data) {
    var _a, _b;
    return {
        id: data.id,
        locationId: data.location_id,
        name: data.name,
        hourlyRate: parseFloat(data.hourly_rate) || 0,
        startTime: data.start_time,
        endTime: data.end_time,
        daysOfWeek: data.days_of_week || [],
        validFrom: data.valid_from,
        validTo: data.valid_to,
        isActive: (_a = data.is_active) !== null && _a !== void 0 ? _a : true,
        isExtensionRate: (_b = data.is_extension_rate) !== null && _b !== void 0 ? _b : false,
        userType: data.user_type || 'regular',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}
// ── Service ──
class PricingService {
    getPricingRules(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('pricing_rules')
                .select('name, hourly_rate, start_time, end_time, days_of_week')
                .eq('location_id', locationId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching pricing rules');
                throw new Error('Failed to fetch pricing rules');
            }
            const formattedPricingRules = data.map(rule => ({
                name: rule.name,
                hourlyRate: rule.hourly_rate,
                startTime: rule.start_time,
                endTime: rule.end_time,
                daysOfWeek: rule.days_of_week
            }));
            return formattedPricingRules;
        });
    }
    getAllPricingRules(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('pricing_rules')
                .select('*')
                .eq('location_id', locationId)
                .order('created_at', { ascending: true });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching pricing rules');
                throw new Error('Failed to fetch pricing rules');
            }
            return data.map(mapRow);
        });
    }
    createPricingRule(locationId, rule) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const userType = rule.userType || 'regular';
            const isExtension = (_a = rule.isExtensionRate) !== null && _a !== void 0 ? _a : false;
            const startTime = rule.startTime || null;
            const endTime = rule.endTime || null;
            const days = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : ALL_DAYS.map(Number);
            // Overlap validation
            const conflict = yield findOverlap(locationId, userType, isExtension, startTime, endTime, days);
            if (conflict) {
                throw new Error(`Time range overlaps with existing rule "${conflict}". Adjust the time or days to avoid conflicts.`);
            }
            const insertData = {
                location_id: locationId,
                name: rule.name,
                hourly_rate: rule.hourlyRate,
                is_active: (_b = rule.isActive) !== null && _b !== void 0 ? _b : true,
                is_extension_rate: isExtension,
                user_type: userType,
            };
            if (startTime)
                insertData.start_time = startTime;
            if (endTime)
                insertData.end_time = endTime;
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0)
                insertData.days_of_week = rule.daysOfWeek;
            if (rule.validFrom)
                insertData.valid_from = rule.validFrom;
            if (rule.validTo)
                insertData.valid_to = rule.validTo;
            const { data, error } = yield database_1.supabase
                .from('pricing_rules')
                .insert(insertData)
                .select('*')
                .single();
            if (error || !data) {
                logger_1.logger.error({ err: error }, 'Error creating pricing rule');
                throw new Error('Failed to create pricing rule');
            }
            return mapRow(data);
        });
    }
    updatePricingRule(ruleId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!ruleId) {
                throw new Error('Pricing rule ID is required');
            }
            // Fetch the current rule to merge with updates for overlap check
            const { data: current, error: fetchErr } = yield database_1.supabase
                .from('pricing_rules')
                .select('*')
                .eq('id', ruleId)
                .single();
            if (fetchErr || !current) {
                throw new Error('Pricing rule not found');
            }
            const mergedUserType = updates.userType !== undefined ? updates.userType : current.user_type;
            const mergedIsExtension = updates.isExtensionRate !== undefined ? updates.isExtensionRate : current.is_extension_rate;
            const mergedStartTime = updates.startTime !== undefined ? updates.startTime : current.start_time;
            const mergedEndTime = updates.endTime !== undefined ? updates.endTime : current.end_time;
            const mergedDays = updates.daysOfWeek !== undefined ? updates.daysOfWeek : (current.days_of_week || []);
            const mergedIsActive = updates.isActive !== undefined ? updates.isActive : current.is_active;
            // Only validate overlap if the rule will be active
            if (mergedIsActive) {
                const conflict = yield findOverlap(current.location_id, mergedUserType, mergedIsExtension, mergedStartTime, mergedEndTime, mergedDays.length > 0 ? mergedDays : ALL_DAYS.map(Number), ruleId);
                if (conflict) {
                    throw new Error(`Time range overlaps with existing rule "${conflict}". Adjust the time or days to avoid conflicts.`);
                }
            }
            const updateData = {
                updated_at: new Date().toISOString()
            };
            if (updates.name !== undefined)
                updateData.name = updates.name;
            if (updates.hourlyRate !== undefined)
                updateData.hourly_rate = updates.hourlyRate;
            if (updates.startTime !== undefined)
                updateData.start_time = updates.startTime;
            if (updates.endTime !== undefined)
                updateData.end_time = updates.endTime;
            if (updates.daysOfWeek !== undefined)
                updateData.days_of_week = updates.daysOfWeek;
            if (updates.validFrom !== undefined)
                updateData.valid_from = updates.validFrom;
            if (updates.validTo !== undefined)
                updateData.valid_to = updates.validTo;
            if (updates.isActive !== undefined)
                updateData.is_active = updates.isActive;
            if (updates.isExtensionRate !== undefined)
                updateData.is_extension_rate = updates.isExtensionRate;
            if (updates.userType !== undefined)
                updateData.user_type = updates.userType;
            const { data, error } = yield database_1.supabase
                .from('pricing_rules')
                .update(updateData)
                .eq('id', ruleId)
                .select('*')
                .single();
            if (error || !data) {
                logger_1.logger.error({ err: error }, 'Error updating pricing rule');
                throw new Error('Failed to update pricing rule');
            }
            return mapRow(data);
        });
    }
    deletePricingRule(ruleId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!ruleId) {
                throw new Error('Pricing rule ID is required');
            }
            const { error } = yield database_1.supabase
                .from('pricing_rules')
                .delete()
                .eq('id', ruleId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error deleting pricing rule');
                throw new Error('Failed to delete pricing rule');
            }
        });
    }
}
exports.PricingService = PricingService;
