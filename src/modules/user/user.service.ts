import { supabase } from '../../config/database';
import { stripe } from '../../config/stripe';
import { logger } from '../../shared/utils/logger';

export class UserService {
  async deleteAccount(userId: string): Promise<{ success: boolean; message: string }> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (checkError || !existingUser) {
        throw new Error('User not found');
      }

      // 1. Mark the account as deleted and free the email for re-registration
      const { error: profileUpdateError } = await supabase
        .from('user_profiles')
        .update({
          deleted_at: new Date().toISOString(),
          email: `deleted-${userId}@deleted.local`,
        })
        .eq('id', userId);

      if (profileUpdateError) {
        logger.error({ err: profileUpdateError }, 'Error marking user profile as deleted');
        throw new Error('Failed to delete account');
      }

      // 2. Ban the auth user and reassign its email so the original
      //    email is freed up for re-registration.
      //    We can't delete auth.users because user_profiles FK cascades to it,
      //    and user_profiles is referenced by bookings/payments/etc.
      const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
        email: `deleted-${userId}@deleted.local`,
      });

      if (banError) {
        logger.warn({ err: banError }, 'Failed to ban auth user');
      }

      logger.info({ userId }, 'Account soft-deleted and auth user banned');

      return {
        success: true,
        message: 'Account deleted successfully.'
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error in deleteAccount');
      throw new Error(error.message || 'Failed to delete account');
    }
  }

  async exportUserData(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const [profile, bookings, payments, agreements, marketingPrefs, accessLogs] = await Promise.all([
      supabase.from('user_profiles').select('id, email, full_name, phone, created_at').eq('id', userId).single(),
      supabase.from('bookings').select('id, location_id, bay_id, start_time, end_time, total_amount, status, party_size, created_at').eq('user_id', userId),
      supabase.from('payments').select('id, amount, status, created_at').eq('user_id', userId),
      supabase.from('user_agreements').select('agreement_type, accepted_at').eq('user_id', userId),
      supabase.from('marketing_preferences').select('email_opted_in, email_opted_out, email_opted_in_at, email_opted_out_at').eq('user_id', userId),
      supabase.from('access_logs').select('action, success, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
    ]);

    return {
      exported_at: new Date().toISOString(),
      profile: profile.data || null,
      bookings: bookings.data || [],
      payments: payments.data || [],
      agreements: agreements.data || [],
      marketing_preferences: marketingPrefs.data || [],
      access_logs: accessLogs.data || [],
    };
  }

  async getUserProfile(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, phone, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error({ err: error }, 'Error fetching user profile');
      throw new Error('Failed to fetch user profile');
    }

    return data;
  }
} 