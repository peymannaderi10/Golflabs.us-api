import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

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
  async getAllLocations() {
    const { data: locations, error } = await supabase
      .from('locations')
      .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, sales_tax_rate')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      logger.error({ err: error }, 'Error fetching locations');
      throw new Error('Failed to fetch locations');
    }

    const locationIds = locations.map(l => l.id);
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
}
