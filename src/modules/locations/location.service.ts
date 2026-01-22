import { supabase } from '../../config/database';

export class LocationService {
  async getAllLocations() {
    const { data, error } = await supabase
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
  }

  async getLocationById(locationId: string) {
    if (!locationId) {
      throw new Error('Location ID is required');
    }

    const { data, error } = await supabase
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
      .select('id, name, slug, address, city, state, zip_code, phone, timezone, status, settings, sales_tax_rate')
      .single();

    if (error || !data) {
      console.error(`Error updating location ${locationId}:`, error);
      throw new Error('Failed to update location');
    }

    return {
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
  }
} 