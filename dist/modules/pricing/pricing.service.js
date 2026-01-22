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
                console.error('Error fetching pricing rules:', error);
                throw new Error('Failed to fetch pricing rules');
            }
            return data.map(rule => {
                var _a;
                return ({
                    id: rule.id,
                    locationId: rule.location_id,
                    name: rule.name,
                    hourlyRate: parseFloat(rule.hourly_rate) || 0,
                    startTime: rule.start_time,
                    endTime: rule.end_time,
                    daysOfWeek: rule.days_of_week || [],
                    validFrom: rule.valid_from,
                    validTo: rule.valid_to,
                    isActive: (_a = rule.is_active) !== null && _a !== void 0 ? _a : true,
                    createdAt: rule.created_at,
                    updatedAt: rule.updated_at
                });
            });
        });
    }
    createPricingRule(locationId, rule) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!locationId) {
                throw new Error('Location ID is required');
            }
            const insertData = {
                location_id: locationId,
                name: rule.name,
                hourly_rate: rule.hourlyRate,
                is_active: (_a = rule.isActive) !== null && _a !== void 0 ? _a : true,
            };
            if (rule.startTime)
                insertData.start_time = rule.startTime;
            if (rule.endTime)
                insertData.end_time = rule.endTime;
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
                console.error('Error creating pricing rule:', error);
                throw new Error('Failed to create pricing rule');
            }
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
                isActive: (_b = data.is_active) !== null && _b !== void 0 ? _b : true,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };
        });
    }
    updatePricingRule(ruleId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!ruleId) {
                throw new Error('Pricing rule ID is required');
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
            const { data, error } = yield database_1.supabase
                .from('pricing_rules')
                .update(updateData)
                .eq('id', ruleId)
                .select('*')
                .single();
            if (error || !data) {
                console.error('Error updating pricing rule:', error);
                throw new Error('Failed to update pricing rule');
            }
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
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };
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
                console.error('Error deleting pricing rule:', error);
                throw new Error('Failed to delete pricing rule');
            }
        });
    }
}
exports.PricingService = PricingService;
