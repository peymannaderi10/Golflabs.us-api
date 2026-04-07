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
exports.userTypesService = exports.UserTypesService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
class UserTypesService {
    getByLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('user_types')
                .select('*')
                .eq('location_id', locationId)
                .order('is_default', { ascending: false })
                .order('label', { ascending: true });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching user types');
                throw new Error('Failed to fetch user types');
            }
            return (data || []).map(this.mapRow);
        });
    }
    create(locationId, input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const slug = input.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            if (input.isDefault) {
                yield database_1.supabase
                    .from('user_types')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .eq('location_id', locationId)
                    .eq('is_default', true);
            }
            const { data, error } = yield database_1.supabase
                .from('user_types')
                .insert({
                location_id: locationId,
                slug,
                label: input.label,
                is_default: (_a = input.isDefault) !== null && _a !== void 0 ? _a : false,
            })
                .select('*')
                .single();
            if (error) {
                if (error.code === '23505') {
                    throw new Error(`A user type with slug "${slug}" already exists at this location`);
                }
                logger_1.logger.error({ err: error }, 'Error creating user type');
                throw new Error('Failed to create user type');
            }
            return this.mapRow(data);
        });
    }
    update(id, updates, callerLocationIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: existing, error: fetchErr } = yield database_1.supabase
                .from('user_types')
                .select('*')
                .eq('id', id)
                .single();
            if (fetchErr || !existing) {
                throw new Error('User type not found');
            }
            if (callerLocationIds && !callerLocationIds.includes(existing.location_id)) {
                throw new Error('Access denied: user type belongs to a different location');
            }
            const updateData = { updated_at: new Date().toISOString() };
            if (updates.slug !== undefined) {
                updateData.slug = updates.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            }
            if (updates.label !== undefined) {
                updateData.label = updates.label;
            }
            if (updates.isDefault === true && !existing.is_default) {
                yield database_1.supabase
                    .from('user_types')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .eq('location_id', existing.location_id)
                    .eq('is_default', true);
                updateData.is_default = true;
            }
            const oldSlug = existing.slug;
            const newSlug = updateData.slug;
            const { data, error } = yield database_1.supabase
                .from('user_types')
                .update(updateData)
                .eq('id', id)
                .select('*')
                .single();
            if (error) {
                if (error.code === '23505') {
                    throw new Error(`A user type with that slug already exists at this location`);
                }
                logger_1.logger.error({ err: error }, 'Error updating user type');
                throw new Error('Failed to update user type');
            }
            // Cascade slug rename to user_profiles and pricing_rules (scoped to this location)
            if (newSlug && newSlug !== oldSlug) {
                yield database_1.supabase
                    .from('user_profiles')
                    .update({ user_type: newSlug })
                    .eq('user_type', oldSlug)
                    .eq('location_id', existing.location_id);
                yield database_1.supabase
                    .from('pricing_rules')
                    .update({ user_type: newSlug })
                    .eq('location_id', existing.location_id)
                    .eq('user_type', oldSlug);
            }
            return this.mapRow(data);
        });
    }
    delete(id, callerLocationIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: existing, error: fetchErr } = yield database_1.supabase
                .from('user_types')
                .select('*')
                .eq('id', id)
                .single();
            if (fetchErr || !existing) {
                throw new Error('User type not found');
            }
            if (callerLocationIds && !callerLocationIds.includes(existing.location_id)) {
                throw new Error('Access denied: user type belongs to a different location');
            }
            if (existing.is_default) {
                throw new Error('Cannot delete the default user type');
            }
            // Check for users still assigned this type at this location
            const { count: userCount } = yield database_1.supabase
                .from('user_profiles')
                .select('id', { count: 'exact', head: true })
                .eq('user_type', existing.slug)
                .eq('location_id', existing.location_id);
            if (userCount && userCount > 0) {
                throw new Error(`Cannot delete: ${userCount} customer(s) are still assigned this type. Reassign them first.`);
            }
            // Check for pricing rules referencing this type
            const { count: ruleCount } = yield database_1.supabase
                .from('pricing_rules')
                .select('id', { count: 'exact', head: true })
                .eq('location_id', existing.location_id)
                .eq('user_type', existing.slug);
            if (ruleCount && ruleCount > 0) {
                throw new Error(`Cannot delete: ${ruleCount} pricing rule(s) reference this type. Remove them first.`);
            }
            const { error } = yield database_1.supabase
                .from('user_types')
                .delete()
                .eq('id', id);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error deleting user type');
                throw new Error('Failed to delete user type');
            }
        });
    }
    /** Look up the default slug for a location (used by pricing logic). */
    getDefaultSlug(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield database_1.supabase
                .from('user_types')
                .select('slug')
                .eq('location_id', locationId)
                .eq('is_default', true)
                .single();
            return (data === null || data === void 0 ? void 0 : data.slug) || 'regular';
        });
    }
    mapRow(row) {
        return {
            id: row.id,
            locationId: row.location_id,
            slug: row.slug,
            label: row.label,
            isDefault: row.is_default,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
exports.UserTypesService = UserTypesService;
exports.userTypesService = new UserTypesService();
