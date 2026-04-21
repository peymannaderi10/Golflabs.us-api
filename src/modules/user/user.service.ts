import { supabase } from '../../config/database';
import { stripe } from '../../config/stripe';
import { logger } from '../../shared/utils/logger';
import { SocketService } from '../sockets/socket.service';
import { NotificationService } from '../email/notification.service';

export class UserService {
  async deleteAccount(userId: string, socketService?: SocketService): Promise<{ success: boolean; message: string }> {
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

      // 1. Cancel all active/future bookings so unlock links stop working
      //    and the kiosk gets notified
      const { data: activeBookings } = await supabase
        .from('bookings')
        .select('id, location_id, space_id, status')
        .eq('user_id', userId)
        .in('status', ['confirmed', 'reserved']);

      if (activeBookings && activeBookings.length > 0) {
        const bookingIds = activeBookings.map(b => b.id);

        // Cancel all active bookings and expire them immediately
        await supabase
          .from('bookings')
          .update({ status: 'cancelled', expires_at: new Date().toISOString() })
          .in('id', bookingIds);

        // Create cancellation records for audit trail
        const cancellationRows = bookingIds.map(id => ({
          booking_id: id,
          cancelled_by: userId,
          cancellation_reason: 'Account deleted by customer',
          cancellation_fee: 0,
          refund_amount: 0,
          cancelled_at: new Date().toISOString(),
        }));
        const { error: cancellationError } = await supabase
          .from('booking_cancellations')
          .insert(cancellationRows);
        if (cancellationError) {
          logger.error({ err: cancellationError, userId }, 'Error creating cancellation records for deleted account');
        }

        // Delete pending reminder notifications so they don't fire after deletion
        for (const bookingId of bookingIds) {
          try {
            await NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');
          } catch (notifErr) {
            logger.error({ err: notifErr, bookingId }, 'Error deleting reminder notification for cancelled booking');
          }
        }

        logger.info({ userId, cancelledCount: bookingIds.length }, 'Cancelled active bookings for deleted account');

        // Notify kiosks so space screens update
        if (socketService) {
          for (const booking of activeBookings) {
            if (booking.location_id && booking.space_id) {
              try {
                socketService.triggerBookingUpdate(booking.location_id, booking.space_id, booking.id);
              } catch (socketErr) {
                logger.error({ err: socketErr, bookingId: booking.id }, 'Error notifying kiosk of cancelled booking');
              }
            }
          }
        }
      }

      // 2. Mark the account as deleted and free the email for re-registration
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

      // 3. Unlink any OAuth identities (e.g. Google) so the provider account
      //    is freed up for re-registration with a new account.
      //    Uses a SECURITY DEFINER RPC function since PostgREST can't access
      //    the auth schema and the GoTrue admin endpoint isn't available.
      const { error: unlinkError } = await supabase.rpc('delete_oauth_identities', {
        target_user_id: userId,
      });
      if (unlinkError) {
        logger.warn({ err: unlinkError }, 'Failed to unlink OAuth identities');
      } else {
        logger.info({ userId }, 'Unlinked OAuth identities');
      }

      // 4. Ban the auth user and reassign its email so the original
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
      supabase.from('bookings').select('id, location_id, space_id, start_time, end_time, total_amount, status, party_size, created_at').eq('user_id', userId),
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

  /**
   * Associate a user with a location in the user_locations junction table.
   * Called at signup/profile-complete time so the user shows up in the
   * location's customer list even before they make their first booking.
   *
   * Uses service-role upsert because user_locations INSERT was locked down
   * to service_role by migration 056 (anon key can't insert).
   */
  async associateUserWithLocation(userId: string, locationId: string): Promise<{ success: boolean }> {
    if (!userId || !locationId) {
      throw new Error('userId and locationId are required');
    }

    // Verify the location exists before writing the association. Without
    // this a caller could create rows pointing at arbitrary UUIDs.
    const { data: location, error: locErr } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .maybeSingle();

    if (locErr || !location) {
      throw new Error('Location not found');
    }

    const { error } = await supabase
      .from('user_locations')
      .upsert({ user_id: userId, location_id: locationId }, { onConflict: 'user_id,location_id' });

    if (error) {
      logger.error({ err: error, userId, locationId }, 'Failed to associate user with location');
      throw new Error('Failed to associate user with location');
    }

    return { success: true };
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