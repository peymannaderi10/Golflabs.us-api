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
                console.error('Error fetching pricing rules:', error);
                throw new Error('Failed to fetch pricing rules');
            }
            // Format the pricing rules to match the frontend's expected format
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
}
exports.PricingService = PricingService;
