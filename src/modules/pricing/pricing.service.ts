import { supabase } from '../../config/database';
import { PricingRule } from '../../shared/types/common.types';

export interface PricingRuleFull {
  id: string;
  locationId: string;
  name: string;
  hourlyRate: number;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  validFrom?: string;
  validTo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PricingService {
  async getPricingRules(locationId: string): Promise<PricingRule[]> {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('pricing_rules')
      .select('name, hourly_rate, start_time, end_time, days_of_week')
      .eq('location_id', locationId);

    if (error) {
      console.error('Error fetching pricing rules:', error);
      throw new Error('Failed to fetch pricing rules');
    }

    // Format the pricing rules to match the frontend's expected format
    const formattedPricingRules: PricingRule[] = data.map(rule => ({
      name: rule.name,
      hourlyRate: rule.hourly_rate,
      startTime: rule.start_time,
      endTime: rule.end_time,
      daysOfWeek: rule.days_of_week
    }));

    return formattedPricingRules;
  }

  async getAllPricingRules(locationId: string): Promise<PricingRuleFull[]> {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pricing rules:', error);
      throw new Error('Failed to fetch pricing rules');
    }

    return data.map(rule => ({
      id: rule.id,
      locationId: rule.location_id,
      name: rule.name,
      hourlyRate: parseFloat(rule.hourly_rate) || 0,
      startTime: rule.start_time,
      endTime: rule.end_time,
      daysOfWeek: rule.days_of_week || [],
      validFrom: rule.valid_from,
      validTo: rule.valid_to,
      isActive: rule.is_active ?? true,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at
    }));
  }

  async createPricingRule(locationId: string, rule: Omit<PricingRuleFull, 'id' | 'locationId' | 'createdAt' | 'updatedAt'>): Promise<PricingRuleFull> {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const insertData: any = {
      location_id: locationId,
      name: rule.name,
      hourly_rate: rule.hourlyRate,
      is_active: rule.isActive ?? true,
    };

    if (rule.startTime) insertData.start_time = rule.startTime;
    if (rule.endTime) insertData.end_time = rule.endTime;
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) insertData.days_of_week = rule.daysOfWeek;
    if (rule.validFrom) insertData.valid_from = rule.validFrom;
    if (rule.validTo) insertData.valid_to = rule.validTo;

    const { data, error } = await supabase
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
      isActive: data.is_active ?? true,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async updatePricingRule(ruleId: string, updates: Partial<Omit<PricingRuleFull, 'id' | 'locationId' | 'createdAt' | 'updatedAt'>>): Promise<PricingRuleFull> {
    if (!ruleId) {
      throw new Error('Pricing rule ID is required');
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.hourlyRate !== undefined) updateData.hourly_rate = updates.hourlyRate;
    if (updates.startTime !== undefined) updateData.start_time = updates.startTime;
    if (updates.endTime !== undefined) updateData.end_time = updates.endTime;
    if (updates.daysOfWeek !== undefined) updateData.days_of_week = updates.daysOfWeek;
    if (updates.validFrom !== undefined) updateData.valid_from = updates.validFrom;
    if (updates.validTo !== undefined) updateData.valid_to = updates.validTo;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { data, error } = await supabase
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
      isActive: data.is_active ?? true,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async deletePricingRule(ruleId: string): Promise<void> {
    if (!ruleId) {
      throw new Error('Pricing rule ID is required');
    }

    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      console.error('Error deleting pricing rule:', error);
      throw new Error('Failed to delete pricing rule');
    }
  }
} 