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
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
                .eq('status', 'active')
                .is('deleted_at', null)
                .order('name', { ascending: true });
            if (error) {
                console.error('Error fetching locations:', error);
                throw new Error('Failed to fetch locations');
            }
            const formattedLocations = data.map(location => ({
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
                salesTaxRate: parseFloat(location.sales_tax_rate) || 0
            }));
            return formattedLocations;
        });
    }
    getLocationById(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('locations')
                .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, settings, sales_tax_rate')
                .eq('id', locationId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .single();
            if (error || !data) {
                console.error(`Location ${locationId} not found:`, error);
                throw new Error('Location not found');
            }
            const formattedLocation = {
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
                settings: data.settings,
                salesTaxRate: parseFloat(data.sales_tax_rate) || 0
            };
            return formattedLocation;
        });
    }
}
exports.LocationService = LocationService;
