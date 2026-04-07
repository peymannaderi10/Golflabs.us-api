import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

export interface UserTypeRecord {
  id: string;
  locationId: string;
  slug: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export class UserTypesService {
  async getByLocation(locationId: string): Promise<UserTypeRecord[]> {
    const { data, error } = await supabase
      .from('user_types')
      .select('*')
      .eq('location_id', locationId)
      .order('is_default', { ascending: false })
      .order('label', { ascending: true });

    if (error) {
      logger.error({ err: error }, 'Error fetching user types');
      throw new Error('Failed to fetch user types');
    }

    return (data || []).map(this.mapRow);
  }

  async create(locationId: string, input: { slug: string; label: string; isDefault?: boolean }): Promise<UserTypeRecord> {
    const slug = input.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    if (input.isDefault) {
      await supabase
        .from('user_types')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('location_id', locationId)
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('user_types')
      .insert({
        location_id: locationId,
        slug,
        label: input.label,
        is_default: input.isDefault ?? false,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A user type with slug "${slug}" already exists at this location`);
      }
      logger.error({ err: error }, 'Error creating user type');
      throw new Error('Failed to create user type');
    }

    return this.mapRow(data);
  }

  async update(id: string, updates: { slug?: string; label?: string; isDefault?: boolean }, callerLocationIds?: string[]): Promise<UserTypeRecord> {
    const { data: existing, error: fetchErr } = await supabase
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

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (updates.slug !== undefined) {
      updateData.slug = updates.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
    if (updates.label !== undefined) {
      updateData.label = updates.label;
    }

    if (updates.isDefault === true && !existing.is_default) {
      await supabase
        .from('user_types')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('location_id', existing.location_id)
        .eq('is_default', true);
      updateData.is_default = true;
    }

    const oldSlug = existing.slug;
    const newSlug = updateData.slug;

    const { data, error } = await supabase
      .from('user_types')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A user type with that slug already exists at this location`);
      }
      logger.error({ err: error }, 'Error updating user type');
      throw new Error('Failed to update user type');
    }

    // Cascade slug rename to user_profiles and pricing_rules (scoped to this location)
    if (newSlug && newSlug !== oldSlug) {
      await supabase
        .from('user_profiles')
        .update({ user_type: newSlug })
        .eq('user_type', oldSlug)
        .eq('location_id', existing.location_id);

      await supabase
        .from('pricing_rules')
        .update({ user_type: newSlug })
        .eq('location_id', existing.location_id)
        .eq('user_type', oldSlug);
    }

    return this.mapRow(data);
  }

  async delete(id: string, callerLocationIds?: string[]): Promise<void> {
    const { data: existing, error: fetchErr } = await supabase
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
    const { count: userCount } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_type', existing.slug)
      .eq('location_id', existing.location_id);

    if (userCount && userCount > 0) {
      throw new Error(`Cannot delete: ${userCount} customer(s) are still assigned this type. Reassign them first.`);
    }

    // Check for pricing rules referencing this type
    const { count: ruleCount } = await supabase
      .from('pricing_rules')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', existing.location_id)
      .eq('user_type', existing.slug);

    if (ruleCount && ruleCount > 0) {
      throw new Error(`Cannot delete: ${ruleCount} pricing rule(s) reference this type. Remove them first.`);
    }

    const { error } = await supabase
      .from('user_types')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error({ err: error }, 'Error deleting user type');
      throw new Error('Failed to delete user type');
    }
  }

  /** Look up the default slug for a location (used by pricing logic). */
  async getDefaultSlug(locationId: string): Promise<string> {
    const { data } = await supabase
      .from('user_types')
      .select('slug')
      .eq('location_id', locationId)
      .eq('is_default', true)
      .single();

    return data?.slug || 'regular';
  }

  private mapRow(row: any): UserTypeRecord {
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

export const userTypesService = new UserTypesService();
