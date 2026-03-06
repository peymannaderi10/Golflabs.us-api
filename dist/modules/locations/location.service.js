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
class LocationService {
    getAllLocations() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('locations')
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate, location_settings(*)')
                .eq('status', 'active')
                .is('deleted_at', null)
                .order('name', { ascending: true });
            if (error) {
                console.error('Error fetching locations:', error);
                throw new Error('Failed to fetch locations');
            }
            const formattedLocations = data.map(location => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                const ls = ((_a = location.location_settings) === null || _a === void 0 ? void 0 : _a[0]) || {};
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
                    settings: {
                        membershipsEnabled: (_b = ls.memberships_enabled) !== null && _b !== void 0 ? _b : false,
                        leaguesEnabled: (_c = ls.leagues_enabled) !== null && _c !== void 0 ? _c : true,
                        defaultBookingWindowDays: (_d = ls.default_booking_window_days) !== null && _d !== void 0 ? _d : 7,
                        defaultBookingHoursStart: (_e = ls.default_booking_hours_start) !== null && _e !== void 0 ? _e : null,
                        defaultBookingHoursEnd: (_f = ls.default_booking_hours_end) !== null && _f !== void 0 ? _f : null,
                        cancellationPolicyHours: (_g = ls.cancellation_policy_hours) !== null && _g !== void 0 ? _g : 24,
                        brandPrimaryColor: (_h = ls.brand_primary_color) !== null && _h !== void 0 ? _h : '#00A36C',
                        brandLogoUrl: (_j = ls.brand_logo_url) !== null && _j !== void 0 ? _j : null,
                        customDomain: (_k = ls.custom_domain) !== null && _k !== void 0 ? _k : null,
                    },
                };
            });
            return formattedLocations;
        });
    }
    getLocationById(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('locations')
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate, location_settings(*)')
                .eq('id', locationId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .single();
            if (error || !data) {
                console.error(`Location ${locationId} not found:`, error);
                throw new Error('Location not found');
            }
            const ls = ((_a = data.location_settings) === null || _a === void 0 ? void 0 : _a[0]) || {};
            return {
                id: data.id,
                name: data.name,
                slug: data.slug,
                address: data.address,
                city: data.city,
                state: data.state,
                zipCode: data.zip_code,
                phone: data.phone,
                timezone: data.timezone,
                status: data.status,
                salesTaxRate: parseFloat(data.sales_tax_rate) || 0,
                settings: {
                    membershipsEnabled: (_b = ls.memberships_enabled) !== null && _b !== void 0 ? _b : false,
                    leaguesEnabled: (_c = ls.leagues_enabled) !== null && _c !== void 0 ? _c : true,
                    defaultBookingWindowDays: (_d = ls.default_booking_window_days) !== null && _d !== void 0 ? _d : 7,
                    defaultBookingHoursStart: (_e = ls.default_booking_hours_start) !== null && _e !== void 0 ? _e : null,
                    defaultBookingHoursEnd: (_f = ls.default_booking_hours_end) !== null && _f !== void 0 ? _f : null,
                    cancellationPolicyHours: (_g = ls.cancellation_policy_hours) !== null && _g !== void 0 ? _g : 24,
                    brandPrimaryColor: (_h = ls.brand_primary_color) !== null && _h !== void 0 ? _h : '#00A36C',
                    brandLogoUrl: (_j = ls.brand_logo_url) !== null && _j !== void 0 ? _j : null,
                    customDomain: (_k = ls.custom_domain) !== null && _k !== void 0 ? _k : null,
                },
            };
        });
    }
    updateLocation(locationId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
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
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate, location_settings(*)')
                .single();
            if (error || !data) {
                console.error(`Error updating location ${locationId}:`, error);
                throw new Error('Failed to update location');
            }
            const ls = ((_a = data.location_settings) === null || _a === void 0 ? void 0 : _a[0]) || {};
            return {
                id: data.id,
                name: data.name,
                slug: data.slug,
                address: data.address,
                city: data.city,
                state: data.state,
                zipCode: data.zip_code,
                phone: data.phone,
                timezone: data.timezone,
                status: data.status,
                salesTaxRate: parseFloat(data.sales_tax_rate) || 0,
                settings: {
                    membershipsEnabled: (_b = ls.memberships_enabled) !== null && _b !== void 0 ? _b : false,
                    leaguesEnabled: (_c = ls.leagues_enabled) !== null && _c !== void 0 ? _c : true,
                    defaultBookingWindowDays: (_d = ls.default_booking_window_days) !== null && _d !== void 0 ? _d : 7,
                    defaultBookingHoursStart: (_e = ls.default_booking_hours_start) !== null && _e !== void 0 ? _e : null,
                    defaultBookingHoursEnd: (_f = ls.default_booking_hours_end) !== null && _f !== void 0 ? _f : null,
                    cancellationPolicyHours: (_g = ls.cancellation_policy_hours) !== null && _g !== void 0 ? _g : 24,
                    brandPrimaryColor: (_h = ls.brand_primary_color) !== null && _h !== void 0 ? _h : '#00A36C',
                    brandLogoUrl: (_j = ls.brand_logo_url) !== null && _j !== void 0 ? _j : null,
                    customDomain: (_k = ls.custom_domain) !== null && _k !== void 0 ? _k : null,
                },
            };
        });
    }
}
exports.LocationService = LocationService;
