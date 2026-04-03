import { supabase } from '../../config/database';

export interface PricingContext {
  defaultSlug: string;
  userType: string;
  allRules: any[];
}

/**
 * Fetch the default user-type slug, the user's assigned type, and all
 * active pricing rules for a location. Every pricing calculation needs
 * this context, so it lives in one place.
 */
export async function fetchPricingContext(
  locationId: string,
  userId?: string | null,
): Promise<PricingContext> {
  const { data: defaultTypeRow } = await supabase
    .from('user_types')
    .select('slug')
    .eq('location_id', locationId)
    .eq('is_default', true)
    .single();
  const defaultSlug = defaultTypeRow?.slug || 'regular';

  let userType = defaultSlug;
  if (userId) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('id', userId)
      .single();
    if (profile?.user_type) {
      userType = profile.user_type;
    }
  }

  const { data: allRules, error } = await supabase
    .from('pricing_rules')
    .select('name, hourly_rate, start_time, end_time, days_of_week, user_type, is_extension_rate')
    .eq('location_id', locationId)
    .eq('is_active', true);

  if (error) throw error;
  if (!allRules || allRules.length === 0) {
    throw new Error('No pricing rules found for this location');
  }

  return { defaultSlug, userType, allRules };
}

/**
 * Does `rule` cover a 15-min slot at the given local hour / day-of-week?
 * day-of-week uses JS convention (0 = Sunday).
 */
export function ruleCoversSlot(rule: any, localHour: number, dow: number): boolean {
  if (rule.days_of_week && rule.days_of_week.length > 0) {
    const dbDay = dow === 0 ? 7 : dow;
    if (!rule.days_of_week.includes(dbDay.toString()) && !rule.days_of_week.includes(dbDay)) {
      return false;
    }
  }
  if (rule.start_time && rule.end_time) {
    const sH = parseInt(rule.start_time.split(':')[0]);
    const eH = parseInt(rule.end_time.split(':')[0]);
    if (sH < eH) return localHour >= sH && localHour < eH;
    if (sH > eH) return localHour >= sH || localHour < eH;
  }
  return true;
}

/**
 * Given pre-filtered rule lists, pick the one that covers the slot.
 * Tries the user-type-specific list first, falls back to the default list.
 */
export function findRuleForSlot(
  userTypeRules: any[],
  defaultRules: any[],
  localHour: number,
  dow: number,
): any {
  const rule =
    userTypeRules.find(r => ruleCoversSlot(r, localHour, dow)) ??
    defaultRules.find(r => ruleCoversSlot(r, localHour, dow)) ??
    defaultRules[0];

  if (!rule) {
    throw new Error(`No pricing rule covers hour ${localHour} on day ${dow}`);
  }
  return rule;
}

/**
 * Split rules into user-type and default-type lists.
 * For extensions, prefers extension-flagged rules PER USER TYPE,
 * falling back to that type's standard rules if no extension rules exist for it.
 */
export function splitRules(
  allRules: any[],
  userType: string,
  defaultSlug: string,
  forExtension: boolean,
) {
  const standardRules = allRules.filter(r => !r.is_extension_rate);
  const extensionRules = allRules.filter(r => r.is_extension_rate);

  // Pick rules for the user's specific type (if not default)
  let userTypeRules: any[] = [];
  if (userType !== defaultSlug) {
    if (forExtension) {
      // Prefer extension rules for this user type; fall back to their standard rules
      const userExtRules = extensionRules.filter(r => r.user_type === userType);
      userTypeRules = userExtRules.length > 0
        ? userExtRules
        : standardRules.filter(r => r.user_type === userType);
    } else {
      userTypeRules = standardRules.filter(r => r.user_type === userType);
    }
  }

  // Pick rules for the default type (fallback)
  let defaultRules: any[];
  if (forExtension) {
    const defaultExtRules = extensionRules.filter(r => r.user_type === defaultSlug);
    defaultRules = defaultExtRules.length > 0
      ? defaultExtRules
      : standardRules.filter(r => r.user_type === defaultSlug);
  } else {
    defaultRules = standardRules.filter(r => r.user_type === defaultSlug);
  }

  if (userTypeRules.length === 0 && defaultRules.length === 0) {
    throw new Error('No pricing rules found');
  }

  return { userTypeRules, defaultRules };
}

/**
 * Extract local hour and JS day-of-week for a UTC instant in a timezone.
 */
export function localSlotInfo(utcDate: Date, timezone: string): { localHour: number; dow: number } {
  const localHour = parseInt(utcDate.toLocaleString('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  }));
  const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }));
  return { localHour, dow: localDate.getDay() };
}

/**
 * Walk 15-min slots from start→end and sum price in cents.
 */
export function calculateSlotTotal(
  start: Date,
  end: Date,
  timezone: string,
  userTypeRules: any[],
  defaultRules: any[],
): number {
  let totalCents = 0;
  const cursor = new Date(start);

  while (cursor < end) {
    const { localHour, dow } = localSlotInfo(cursor, timezone);
    const rule = findRuleForSlot(userTypeRules, defaultRules, localHour, dow);
    totalCents += (rule.hourly_rate * 100) / 4;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
  }

  return Math.round(totalCents);
}
