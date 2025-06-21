import { supabase } from '../../config/database';
import { PricingRule } from '../../shared/types/common.types';

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
} 