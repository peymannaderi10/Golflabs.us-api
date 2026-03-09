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
exports.fetchPricingContext = fetchPricingContext;
exports.ruleCoversSlot = ruleCoversSlot;
exports.findRuleForSlot = findRuleForSlot;
exports.splitRules = splitRules;
exports.localSlotInfo = localSlotInfo;
exports.calculateSlotTotal = calculateSlotTotal;
const database_1 = require("../../config/database");
/**
 * Fetch the default user-type slug, the user's assigned type, and all
 * active pricing rules for a location. Every pricing calculation needs
 * this context, so it lives in one place.
 */
function fetchPricingContext(locationId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data: defaultTypeRow } = yield database_1.supabase
            .from('user_types')
            .select('slug')
            .eq('location_id', locationId)
            .eq('is_default', true)
            .single();
        const defaultSlug = (defaultTypeRow === null || defaultTypeRow === void 0 ? void 0 : defaultTypeRow.slug) || 'regular';
        let userType = defaultSlug;
        if (userId) {
            const { data: profile } = yield database_1.supabase
                .from('user_profiles')
                .select('user_type')
                .eq('id', userId)
                .single();
            if (profile === null || profile === void 0 ? void 0 : profile.user_type) {
                userType = profile.user_type;
            }
        }
        const { data: allRules, error } = yield database_1.supabase
            .from('pricing_rules')
            .select('name, hourly_rate, start_time, end_time, days_of_week, user_type, is_extension_rate')
            .eq('location_id', locationId)
            .eq('is_active', true);
        if (error)
            throw error;
        if (!allRules || allRules.length === 0) {
            throw new Error('No pricing rules found for this location');
        }
        return { defaultSlug, userType, allRules };
    });
}
/**
 * Does `rule` cover a 15-min slot at the given local hour / day-of-week?
 * day-of-week uses JS convention (0 = Sunday).
 */
function ruleCoversSlot(rule, localHour, dow) {
    if (rule.days_of_week && rule.days_of_week.length > 0) {
        const dbDay = dow === 0 ? 7 : dow;
        if (!rule.days_of_week.includes(dbDay.toString()) && !rule.days_of_week.includes(dbDay)) {
            return false;
        }
    }
    if (rule.start_time && rule.end_time) {
        const sH = parseInt(rule.start_time.split(':')[0]);
        const eH = parseInt(rule.end_time.split(':')[0]);
        if (sH < eH)
            return localHour >= sH && localHour < eH;
        if (sH > eH)
            return localHour >= sH || localHour < eH;
    }
    return true;
}
/**
 * Given pre-filtered rule lists, pick the one that covers the slot.
 * Tries the user-type-specific list first, falls back to the default list.
 */
function findRuleForSlot(userTypeRules, defaultRules, localHour, dow) {
    var _a, _b;
    const rule = (_b = (_a = userTypeRules.find(r => ruleCoversSlot(r, localHour, dow))) !== null && _a !== void 0 ? _a : defaultRules.find(r => ruleCoversSlot(r, localHour, dow))) !== null && _b !== void 0 ? _b : defaultRules[0];
    if (!rule) {
        throw new Error(`No pricing rule covers hour ${localHour} on day ${dow}`);
    }
    return rule;
}
/**
 * Split rules into user-type and default-type lists.
 * For extensions, prefers extension-flagged rules but falls back to standard rules.
 */
function splitRules(allRules, userType, defaultSlug, forExtension) {
    let pool;
    if (forExtension) {
        const extRules = allRules.filter(r => r.is_extension_rate);
        pool = extRules.length > 0 ? extRules : allRules.filter(r => !r.is_extension_rate);
    }
    else {
        pool = allRules.filter(r => !r.is_extension_rate);
    }
    const userTypeRules = userType !== defaultSlug
        ? pool.filter(r => r.user_type === userType)
        : [];
    const defaultRules = pool.filter(r => r.user_type === defaultSlug);
    if (userTypeRules.length === 0 && defaultRules.length === 0) {
        throw new Error('No pricing rules found');
    }
    return { userTypeRules, defaultRules };
}
/**
 * Extract local hour and JS day-of-week for a UTC instant in a timezone.
 */
function localSlotInfo(utcDate, timezone) {
    const localHour = parseInt(utcDate.toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: timezone,
    }));
    const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }));
    return { localHour, dow: localDate.getDay() };
}
/**
 * Walk 15-min slots from start→end and sum price in cents.
 */
function calculateSlotTotal(start, end, timezone, userTypeRules, defaultRules) {
    let totalCents = 0;
    const cursor = new Date(start);
    while (cursor < end) {
        const { localHour, dow } = localSlotInfo(cursor, timezone);
        const rule = findRuleForSlot(userTypeRules, defaultRules, localHour, dow);
        totalCents += (rule.hourly_rate * 100) / 4;
        cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
    }
    return Math.round(totalCents);
}
