import { supabase } from '../../config/database';
import { PricingRule } from '../../shared/types/common.types';
import { logger } from '../../shared/utils/logger';

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
  isExtensionRate: boolean;
  userType: string;
  createdAt: string;
  updatedAt: string;
}

// ── Overlap detection helpers ──

const ALL_DAYS = ['1', '2', '3', '4', '5', '6', '7'];
const MINUTES_IN_DAY = 1440;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Expand a time range into one or two [start, end) segments within 0-1440.
 * Handles wrapping ranges like 09:00-02:00 (covers 9am→midnight + midnight→2am).
 */
function timeSegments(start: string | null, end: string | null): [number, number][] {
  if (!start || !end) return [[0, MINUTES_IN_DAY]];
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return [[0, MINUTES_IN_DAY]];
  if (s < e) return [[s, e]];
  return [[s, MINUTES_IN_DAY], [0, e]];
}

function segmentsOverlap(a: [number, number][], b: [number, number][]): boolean {
  for (const [a1, a2] of a) {
    for (const [b1, b2] of b) {
      if (a1 < b2 && b1 < a2) return true;
    }
  }
  return false;
}

function daysOverlap(d1: (string | number)[], d2: (string | number)[]): boolean {
  const set = new Set(d1.map(String));
  return d2.some(d => set.has(String(d)));
}

/**
 * Check whether a proposed rule's time/days overlap with any existing rule
 * in the same (location, user_type, is_extension_rate) group.
 * Returns the name of the conflicting rule, or null if no conflict.
 */
async function findOverlap(
  locationId: string,
  userType: string,
  isExtensionRate: boolean,
  startTime: string | null,
  endTime: string | null,
  daysOfWeek: (string | number)[],
  excludeRuleId?: string,
): Promise<string | null> {
  let query = supabase
    .from('pricing_rules')
    .select('id, name, start_time, end_time, days_of_week')
    .eq('location_id', locationId)
    .eq('user_type', userType)
    .eq('is_extension_rate', isExtensionRate)
    .eq('is_active', true);

  if (excludeRuleId) {
    query = query.neq('id', excludeRuleId);
  }

  const { data: existing, error } = await query;
  if (error || !existing) return null;

  const newDays = daysOfWeek.length > 0 ? daysOfWeek : ALL_DAYS;
  const newSegs = timeSegments(startTime, endTime);

  for (const rule of existing) {
    const ruleDays = rule.days_of_week?.length > 0 ? rule.days_of_week : ALL_DAYS;
    if (!daysOverlap(newDays, ruleDays)) continue;

    const ruleSegs = timeSegments(rule.start_time, rule.end_time);
    if (segmentsOverlap(newSegs, ruleSegs)) {
      return rule.name;
    }
  }

  return null;
}

// ── Mapping helper ──

function mapRow(data: any): PricingRuleFull {
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
    isExtensionRate: data.is_extension_rate ?? false,
    userType: data.user_type || 'regular',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── Service ──

export class PricingService {
  async getPricingRules(locationId: string): Promise<PricingRule[]> {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    // Fetch default slug and pricing rules in parallel
    const [defaultTypeResult, rulesResult] = await Promise.all([
      supabase
        .from('user_types')
        .select('slug')
        .eq('location_id', locationId)
        .eq('is_default', true)
        .single(),
      supabase
        .from('pricing_rules')
        .select('name, hourly_rate, start_time, end_time, days_of_week, user_type, is_extension_rate')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .eq('is_extension_rate', false),
    ]);

    const defaultSlug = defaultTypeResult.data?.slug || 'regular';
    const data = (rulesResult.data || []).filter(r => r.user_type === defaultSlug);
    const error = rulesResult.error;

    if (error) {
      logger.error({ err: error }, 'Error fetching pricing rules');
      throw new Error('Failed to fetch pricing rules');
    }

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
      logger.error({ err: error }, 'Error fetching pricing rules');
      throw new Error('Failed to fetch pricing rules');
    }

    return data.map(mapRow);
  }

  async createPricingRule(locationId: string, rule: Omit<PricingRuleFull, 'id' | 'locationId' | 'createdAt' | 'updatedAt'>): Promise<PricingRuleFull> {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const userType = rule.userType || 'regular';
    const isExtension = rule.isExtensionRate ?? false;
    const startTime = rule.startTime || null;
    const endTime = rule.endTime || null;
    const days = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : ALL_DAYS.map(Number);

    // Overlap validation
    const conflict = await findOverlap(locationId, userType, isExtension, startTime, endTime, days);
    if (conflict) {
      throw new Error(`Time range overlaps with existing rule "${conflict}". Adjust the time or days to avoid conflicts.`);
    }

    const insertData: any = {
      location_id: locationId,
      name: rule.name,
      hourly_rate: rule.hourlyRate,
      is_active: rule.isActive ?? true,
      is_extension_rate: isExtension,
      user_type: userType,
    };

    if (startTime) insertData.start_time = startTime;
    if (endTime) insertData.end_time = endTime;
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) insertData.days_of_week = rule.daysOfWeek;
    if (rule.validFrom) insertData.valid_from = rule.validFrom;
    if (rule.validTo) insertData.valid_to = rule.validTo;

    const { data, error } = await supabase
      .from('pricing_rules')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      logger.error({ err: error }, 'Error creating pricing rule');
      throw new Error('Failed to create pricing rule');
    }

    return mapRow(data);
  }

  async updatePricingRule(ruleId: string, updates: Partial<Omit<PricingRuleFull, 'id' | 'locationId' | 'createdAt' | 'updatedAt'>>, employeeLocationIds: string[]): Promise<PricingRuleFull> {
    if (!ruleId) {
      throw new Error('Pricing rule ID is required');
    }

    // Fetch the current rule to merge with updates for overlap check
    const { data: current, error: fetchErr } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (fetchErr || !current) {
      throw new Error('Pricing rule not found');
    }

    // Verify employee has access to this location's pricing rule
    if (!employeeLocationIds.includes(current.location_id)) {
      throw new Error('Access denied: pricing rule belongs to a different location');
    }

    const mergedUserType = updates.userType !== undefined ? updates.userType : current.user_type;
    const mergedIsExtension = updates.isExtensionRate !== undefined ? updates.isExtensionRate : current.is_extension_rate;
    const mergedStartTime = updates.startTime !== undefined ? updates.startTime : current.start_time;
    const mergedEndTime = updates.endTime !== undefined ? updates.endTime : current.end_time;
    const mergedDays = updates.daysOfWeek !== undefined ? updates.daysOfWeek : (current.days_of_week || []);
    const mergedIsActive = updates.isActive !== undefined ? updates.isActive : current.is_active;

    // Only validate overlap if the rule will be active
    if (mergedIsActive) {
      const conflict = await findOverlap(
        current.location_id, mergedUserType, mergedIsExtension,
        mergedStartTime, mergedEndTime,
        mergedDays.length > 0 ? mergedDays : ALL_DAYS.map(Number),
        ruleId,
      );
      if (conflict) {
        throw new Error(`Time range overlaps with existing rule "${conflict}". Adjust the time or days to avoid conflicts.`);
      }
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
    if (updates.isExtensionRate !== undefined) updateData.is_extension_rate = updates.isExtensionRate;
    if (updates.userType !== undefined) updateData.user_type = updates.userType;

    const { data, error } = await supabase
      .from('pricing_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select('*')
      .single();

    if (error || !data) {
      logger.error({ err: error }, 'Error updating pricing rule');
      throw new Error('Failed to update pricing rule');
    }

    return mapRow(data);
  }

  async deletePricingRule(ruleId: string, employeeLocationIds: string[]): Promise<void> {
    if (!ruleId) {
      throw new Error('Pricing rule ID is required');
    }

    // Verify employee owns this location's pricing rule
    const { data: rule, error: fetchErr } = await supabase
      .from('pricing_rules')
      .select('location_id')
      .eq('id', ruleId)
      .single();

    if (fetchErr || !rule) {
      throw new Error('Pricing rule not found');
    }

    if (!employeeLocationIds.includes(rule.location_id)) {
      throw new Error('Access denied: pricing rule belongs to a different location');
    }

    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      logger.error({ err: error }, 'Error deleting pricing rule');
      throw new Error('Failed to delete pricing rule');
    }
  }
}
