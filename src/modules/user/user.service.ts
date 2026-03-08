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

      // 1. Anonymize bookings -- null out user_id but keep the record for financial audit
      await supabase
        .from('bookings')
        .update({ user_id: null, notes: null })
        .eq('user_id', userId);

      // 2. Anonymize payments -- null out user_id but keep for financial records
      await supabase
        .from('payments')
        .update({ user_id: null })
        .eq('user_id', userId);

      // 3. Anonymize access logs -- remove PII fields
      await supabase
        .from('access_logs')
        .update({ user_id: null, ip_address: null, user_agent: null })
        .eq('user_id', userId);

      // 4. Anonymize agreement records -- keep for legal compliance but redact PII
      await supabase
        .from('user_agreements')
        .update({ signer_name: '[deleted]', signer_email: '[deleted]', ip_address: null, user_agent: null })
        .eq('user_id', userId);

      // 5. Delete marketing data entirely
      await supabase.from('campaign_recipients').delete().eq('user_id', userId);
      await supabase.from('marketing_preferences').delete().eq('user_id', userId);

      // 6. Delete notifications
      await supabase.from('notifications').delete().eq('user_id', userId);

      // 7. Delete memberships
      await supabase.from('memberships').delete().eq('user_id', userId);

      // 8. Delete Stripe customer if exists
      if (existingUser.stripe_customer_id) {
        try {
          await stripe.customers.del(existingUser.stripe_customer_id);
        } catch (stripeErr: any) {
          logger.warn({ err: stripeErr, stripeCustomerId: existingUser.stripe_customer_id }, 'Failed to delete Stripe customer');
        }
      }

      // 9. Delete user profile (user_promotions cascades automatically)
      const { error: deleteProfileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) {
        logger.error({ err: deleteProfileError }, 'Error deleting user profile');
        throw new Error('Failed to delete user profile');
      }

      // 10. Delete auth user
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

      if (deleteAuthError) {
        logger.warn({ err: deleteAuthError }, 'Auth user deletion failed after profile deletion');
      }

      logger.info({ userId }, 'Account fully deleted and data anonymized');

      return {
        success: true,
        message: 'Account and personal data deleted successfully.'
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