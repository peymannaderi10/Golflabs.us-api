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
exports.LocationService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const VALID_DOOR_LOCK_TYPES = ['none', 'shelly'];
function formatSettings(ls) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    return {
        membershipsEnabled: (_a = ls.memberships_enabled) !== null && _a !== void 0 ? _a : false,
        leaguesEnabled: (_b = ls.leagues_enabled) !== null && _b !== void 0 ? _b : true,
        marketingEnabled: (_c = ls.marketing_enabled) !== null && _c !== void 0 ? _c : false,
        promotionsEnabled: (_d = ls.promotions_enabled) !== null && _d !== void 0 ? _d : false,
        doorLockType: (_e = ls.door_lock_type) !== null && _e !== void 0 ? _e : 'shelly',
        defaultBookingWindowDays: (_f = ls.default_booking_window_days) !== null && _f !== void 0 ? _f : 7,
        defaultBookingHoursStart: (_g = ls.default_booking_hours_start) !== null && _g !== void 0 ? _g : null,
        defaultBookingHoursEnd: (_h = ls.default_booking_hours_end) !== null && _h !== void 0 ? _h : null,
        cancellationPolicyHours: (_j = ls.cancellation_policy_hours) !== null && _j !== void 0 ? _j : 24,
        bookingBufferMinutes: (_k = ls.booking_buffer_minutes) !== null && _k !== void 0 ? _k : 0,
        bookingGracePeriodBeforeMinutes: (_l = ls.booking_grace_period_before_minutes) !== null && _l !== void 0 ? _l : 0,
        bookingGracePeriodAfterMinutes: (_m = ls.booking_grace_period_after_minutes) !== null && _m !== void 0 ? _m : 0,
        reservationTimeoutMinutes: (_o = ls.reservation_timeout_minutes) !== null && _o !== void 0 ? _o : null,
        brandPrimaryColor: (_p = ls.brand_primary_color) !== null && _p !== void 0 ? _p : '#00A36C',
        brandLogoUrl: (_q = ls.brand_logo_url) !== null && _q !== void 0 ? _q : null,
        customDomain: (_r = ls.custom_domain) !== null && _r !== void 0 ? _r : null,
    };
}
function formatLocation(location, settings) {
    return {
        id: location.id,
        name: location.name,
        slug: location.slug,
        address: location.address,
        city: location.city,
        state: location.state,
        zipCode: location.zip_code,
        phone: location.phone,
        timezone: location.timezone,
        status: location.status,
        salesTaxRate: parseFloat(location.sales_tax_rate) || 0,
        settings: formatSettings(settings),
    };
}
class LocationService {
    getAllLocations() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: locations, error } = yield database_1.supabase
                .from('locations')
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
                .eq('status', 'active')
                .is('deleted_at', null)
                .order('name', { ascending: true });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching locations');
                throw new Error('Failed to fetch locations');
            }
            const locationIds = locations.map(l => l.id);
            const { data: settingsRows } = yield database_1.supabase
                .from('location_settings')
                .select('*')
                .in('location_id', locationIds);
            const settingsMap = new Map();
            if (settingsRows) {
                for (const row of settingsRows) {
                    settingsMap.set(row.location_id, row);
                }
            }
            return locations.map(location => formatLocation(location, settingsMap.get(location.id) || {}));
        });
    }
    getLocationById(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('locations')
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
                .eq('id', locationId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .single();
            if (error || !data) {
                logger_1.logger.error({ err: error, locationId }, 'Location not found');
                throw new Error('Location not found');
            }
            const { data: settingsRow } = yield database_1.supabase
                .from('location_settings')
                .select('*')
                .eq('location_id', locationId)
                .single();
            return formatLocation(data, settingsRow || {});
        });
    }
    updateLocation(locationId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const updateData = {
                updated_at: new Date().toISOString()
            };
            if (updates.sales_tax_rate !== undefined) {
                updateData.sales_tax_rate = updates.sales_tax_rate;
            }
            if (updates.timezone !== undefined) {
                updateData.timezone = updates.timezone;
            }
            if (updates.status !== undefined) {
                updateData.status = updates.status;
            }
            if (updates.phone !== undefined) {
                updateData.phone = updates.phone;
            }
            const { data, error } = yield database_1.supabase
                .from('locations')
                .update(updateData)
                .eq('id', locationId)
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
                .single();
            if (error || !data) {
                logger_1.logger.error({ err: error, locationId }, 'Error updating location');
                throw new Error('Failed to update location');
            }
            const { data: settingsRow } = yield database_1.supabase
                .from('location_settings')
                .select('*')
                .eq('location_id', locationId)
                .single();
            return formatLocation(data, settingsRow || {});
        });
    }
    /**
     * Lightweight lookup for door_lock_type by location.
     * Used by unlock endpoints, reminder jobs, and webhook handlers
     * to decide whether to generate tokens / allow unlock commands.
     */
    static getDoorLockType(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('location_settings')
                .select('door_lock_type')
                .eq('location_id', locationId)
                .single();
            if (error || !data) {
                logger_1.logger.error({ err: error, locationId }, 'Error fetching door_lock_type — cannot determine lock configuration');
                throw new Error('Unable to determine door lock configuration for location');
            }
            const raw = data.door_lock_type;
            return LocationService.isValidDoorLockType(raw) ? raw : 'none';
        });
    }
    static isValidDoorLockType(value) {
        return VALID_DOOR_LOCK_TYPES.includes(value);
    }
}
exports.LocationService = LocationService;
