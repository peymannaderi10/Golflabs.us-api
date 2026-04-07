import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { isReservedSlug } from '../../shared/constants/reserved-slugs';

export type DoorLockType = 'none' | 'shelly';

const VALID_DOOR_LOCK_TYPES: DoorLockType[] = ['none', 'shelly'];

interface LocationSettingsRow {
  memberships_enabled: boolean;
  leagues_enabled: boolean;
  marketing_enabled: boolean;
  promotions_enabled: boolean;
  door_lock_type: DoorLockType;
  default_booking_window_days: number;
  default_booking_hours_start: string | null;
  default_booking_hours_end: string | null;
  cancellation_policy_hours: number;
  booking_buffer_minutes: number;
  booking_grace_period_before_minutes: number;
  booking_grace_period_after_minutes: number;
  reservation_timeout_minutes: number | null;
  brand_primary_color: string;
  brand_logo_url: string | null;
  custom_domain: string | null;
}

function formatSettings(ls: Partial<LocationSettingsRow>) {
  return {
    membershipsEnabled: ls.memberships_enabled ?? false,
    leaguesEnabled: ls.leagues_enabled ?? true,
    marketingEnabled: ls.marketing_enabled ?? false,
    promotionsEnabled: ls.promotions_enabled ?? false,
    doorLockType: ls.door_lock_type ?? 'shelly',
    defaultBookingWindowDays: ls.default_booking_window_days ?? 7,
    defaultBookingHoursStart: ls.default_booking_hours_start ?? null,
    defaultBookingHoursEnd: ls.default_booking_hours_end ?? null,
    cancellationPolicyHours: ls.cancellation_policy_hours ?? 24,
    bookingBufferMinutes: ls.booking_buffer_minutes ?? 0,
    bookingGracePeriodBeforeMinutes: ls.booking_grace_period_before_minutes ?? 0,
    bookingGracePeriodAfterMinutes: ls.booking_grace_period_after_minutes ?? 0,
    reservationTimeoutMinutes: ls.reservation_timeout_minutes ?? null,
    brandPrimaryColor: ls.brand_primary_color ?? '158 100% 33%',
    brandLogoUrl: ls.brand_logo_url ?? null,
    customDomain: ls.custom_domain ?? null,
  };
}

function formatLocation(location: any, settings: Partial<LocationSettingsRow>) {
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

export class LocationService {
  async getLocationById(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
      .from('locations')
      .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
      .eq('id', locationId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      logger.error({ err: error, locationId }, 'Location not found');
      throw new Error('Location not found');
    }

    const { data: settingsRow } = await supabase
      .from('location_settings')
      .select('*')
      .eq('location_id', locationId)
      .single();

    return formatLocation(data, settingsRow || {});
  }

  async updateLocation(locationId: string, updates: {
    sales_tax_rate?: number;
    timezone?: string;
    status?: string;
    phone?: string;
  }) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const updateData: any = {
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

    const { data, error } = await supabase
      .from('locations')
      .update(updateData)
      .eq('id', locationId)
      .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
      .single();

    if (error || !data) {
      logger.error({ err: error, locationId }, 'Error updating location');
      throw new Error('Failed to update location');
    }

    const { data: settingsRow } = await supabase
      .from('location_settings')
      .select('*')
      .eq('location_id', locationId)
      .single();

    return formatLocation(data, settingsRow || {});
  }

  /**
   * Lightweight lookup for door_lock_type by location.
   * Used by unlock endpoints, reminder jobs, and webhook handlers
   * to decide whether to generate tokens / allow unlock commands.
   */
  static async getDoorLockType(locationId: string): Promise<DoorLockType> {
    const { data, error } = await supabase
      .from('location_settings')
      .select('door_lock_type')
      .eq('location_id', locationId)
      .single();

    if (error || !data) {
      logger.error({ err: error, locationId }, 'Error fetching door_lock_type — cannot determine lock configuration');
      throw new Error('Unable to determine door lock configuration for location');
    }

    const raw = data.door_lock_type;
    return LocationService.isValidDoorLockType(raw) ? raw : 'none';
  }

  static isValidDoorLockType(value: string): value is DoorLockType {
    return VALID_DOOR_LOCK_TYPES.includes(value as DoorLockType);
  }

  async getAccessibleLocations(locationIds: string[]) {
    if (locationIds.length === 0) return [];

    const { data: locations, error } = await supabase
      .from('locations')
      .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
      .in('id', locationIds)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      logger.error({ err: error }, 'Error fetching accessible locations');
      throw new Error('Failed to fetch locations');
    }

    const { data: settingsRows } = await supabase
      .from('location_settings')
      .select('*')
      .in('location_id', locationIds);

    const settingsMap = new Map<string, LocationSettingsRow>();
    if (settingsRows) {
      for (const row of settingsRows) {
        settingsMap.set(row.location_id, row);
      }
    }

    return locations.map(location =>
      formatLocation(location, settingsMap.get(location.id) || {})
    );
  }

  /**
   * Resolve a tenant from a hostname slug (e.g. `app`, `gogolf`, `gltest1`).
   *
   * Two valid sources, checked in priority order:
   *   1. `location_settings.custom_domain` — explicit override set during
   *      business signup or via the settings page. Wins over slug because
   *      it represents an intentional choice.
   *   2. `locations.slug` — the canonical URL slug. Lets a tenant rename
   *      their subdomain by editing one column (no settings dance).
   *
   * Returns the first match or null. Both lookups are indexed on a single
   * column, so this is two cheap point-reads — no scan, no join, no list.
   */
  async resolveBySubdomain(subdomain: string) {
    // 1. Custom domain override
    const { data: settingsRow } = await supabase
      .from('location_settings')
      .select('location_id')
      .eq('custom_domain', subdomain)
      .maybeSingle();

    if (settingsRow?.location_id) {
      return this.getLocationById(settingsRow.location_id);
    }

    // 2. Canonical slug
    const { data: locationRow } = await supabase
      .from('locations')
      .select('id')
      .eq('slug', subdomain)
      .is('deleted_at', null)
      .maybeSingle();

    if (locationRow?.id) {
      return this.getLocationById(locationRow.id);
    }

    return null;
  }

  async isSubdomainAvailable(slug: string, excludeLocationId?: string): Promise<{ available: boolean; reason?: string }> {
    if (isReservedSlug(slug)) {
      return { available: false, reason: 'This subdomain is reserved' };
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 3 || slug.length > 40) {
      return { available: false, reason: 'Must be 3-40 characters, lowercase alphanumeric and hyphens, cannot start or end with a hyphen' };
    }

    let query = supabase
      .from('location_settings')
      .select('location_id')
      .eq('custom_domain', slug);

    if (excludeLocationId) {
      query = query.neq('location_id', excludeLocationId);
    }

    const { data } = await query.maybeSingle();
    return { available: !data };
  }
}
