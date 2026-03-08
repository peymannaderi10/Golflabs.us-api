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
function formatSettings(ls) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    return {
        membershipsEnabled: (_a = ls.memberships_enabled) !== null && _a !== void 0 ? _a : false,
        leaguesEnabled: (_b = ls.leagues_enabled) !== null && _b !== void 0 ? _b : true,
        marketingEnabled: (_c = ls.marketing_enabled) !== null && _c !== void 0 ? _c : false,
        defaultBookingWindowDays: (_d = ls.default_booking_window_days) !== null && _d !== void 0 ? _d : 7,
        defaultBookingHoursStart: (_e = ls.default_booking_hours_start) !== null && _e !== void 0 ? _e : null,
        defaultBookingHoursEnd: (_f = ls.default_booking_hours_end) !== null && _f !== void 0 ? _f : null,
        cancellationPolicyHours: (_g = ls.cancellation_policy_hours) !== null && _g !== void 0 ? _g : 24,
        bookingBufferMinutes: (_h = ls.booking_buffer_minutes) !== null && _h !== void 0 ? _h : 0,
        brandPrimaryColor: (_j = ls.brand_primary_color) !== null && _j !== void 0 ? _j : '#00A36C',
        brandLogoUrl: (_k = ls.brand_logo_url) !== null && _k !== void 0 ? _k : null,
        customDomain: (_l = ls.custom_domain) !== null && _l !== void 0 ? _l : null,
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
}
exports.LocationService = LocationService;
