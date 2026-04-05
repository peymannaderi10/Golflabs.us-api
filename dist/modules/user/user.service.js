"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const notification_service_1 = require("../email/notification.service");
class UserService {
    deleteAccount(userId, socketService) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            try {
                const { data: existingUser, error: checkError } = yield database_1.supabase
                    .from('user_profiles')
                    .select('id, email, full_name, stripe_customer_id')
                    .eq('id', userId)
                    .single();
                if (checkError || !existingUser) {
                    throw new Error('User not found');
                }
                // 1. Cancel all active/future bookings so unlock links stop working
                //    and the kiosk gets notified
                const { data: activeBookings } = yield database_1.supabase
                    .from('bookings')
                    .select('id, location_id, space_id, status')
                    .eq('user_id', userId)
                    .in('status', ['confirmed', 'reserved']);
                if (activeBookings && activeBookings.length > 0) {
                    const bookingIds = activeBookings.map(b => b.id);
                    // Cancel all active bookings and expire them immediately
                    yield database_1.supabase
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
                    const { error: cancellationError } = yield database_1.supabase
                        .from('booking_cancellations')
                        .insert(cancellationRows);
                    if (cancellationError) {
                        logger_1.logger.error({ err: cancellationError, userId }, 'Error creating cancellation records for deleted account');
                    }
                    // Delete pending reminder notifications so they don't fire after deletion
                    for (const bookingId of bookingIds) {
                        try {
                            yield notification_service_1.NotificationService.deleteNotificationsByBookingAndType(bookingId, 'reminder');
                        }
                        catch (notifErr) {
                            logger_1.logger.error({ err: notifErr, bookingId }, 'Error deleting reminder notification for cancelled booking');
                        }
                    }
                    logger_1.logger.info({ userId, cancelledCount: bookingIds.length }, 'Cancelled active bookings for deleted account');
                    // Notify kiosks so space screens update
                    if (socketService) {
                        for (const booking of activeBookings) {
                            if (booking.location_id && booking.space_id) {
                                try {
                                    socketService.triggerBookingUpdate(booking.location_id, booking.space_id, booking.id);
                                }
                                catch (socketErr) {
                                    logger_1.logger.error({ err: socketErr, bookingId: booking.id }, 'Error notifying kiosk of cancelled booking');
                                }
                            }
                        }
                    }
                }
                // 2. Mark the account as deleted and free the email for re-registration
                const { error: profileUpdateError } = yield database_1.supabase
                    .from('user_profiles')
                    .update({
                    deleted_at: new Date().toISOString(),
                    email: `deleted-${userId}@deleted.local`,
                })
                    .eq('id', userId);
                if (profileUpdateError) {
                    logger_1.logger.error({ err: profileUpdateError }, 'Error marking user profile as deleted');
                    throw new Error('Failed to delete account');
                }
                // 3. Unlink any OAuth identities (e.g. Google) so the provider account
                //    is freed up for re-registration with a new account.
                //    Uses a SECURITY DEFINER RPC function since PostgREST can't access
                //    the auth schema and the GoTrue admin endpoint isn't available.
                const { error: unlinkError } = yield database_1.supabase.rpc('delete_oauth_identities', {
                    target_user_id: userId,
                });
                if (unlinkError) {
                    logger_1.logger.warn({ err: unlinkError }, 'Failed to unlink OAuth identities');
                }
                else {
                    logger_1.logger.info({ userId }, 'Unlinked OAuth identities');
                }
                // 4. Ban the auth user and reassign its email so the original
                //    email is freed up for re-registration.
                //    We can't delete auth.users because user_profiles FK cascades to it,
                //    and user_profiles is referenced by bookings/payments/etc.
                const { error: banError } = yield database_1.supabase.auth.admin.updateUserById(userId, {
                    ban_duration: '876000h',
                    email: `deleted-${userId}@deleted.local`,
                });
                if (banError) {
                    logger_1.logger.warn({ err: banError }, 'Failed to ban auth user');
                }
                logger_1.logger.info({ userId }, 'Account soft-deleted and auth user banned');
                return {
                    success: true,
                    message: 'Account deleted successfully.'
                };
            }
            catch (error) {
                logger_1.logger.error({ err: error }, 'Error in deleteAccount');
                throw new Error(error.message || 'Failed to delete account');
            }
        });
    }
    exportUserData(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            const [profile, bookings, payments, agreements, marketingPrefs, accessLogs] = yield Promise.all([
                database_1.supabase.from('user_profiles').select('id, email, full_name, phone, created_at').eq('id', userId).single(),
                database_1.supabase.from('bookings').select('id, location_id, space_id, start_time, end_time, total_amount, status, party_size, created_at').eq('user_id', userId),
                database_1.supabase.from('payments').select('id, amount, status, created_at').eq('user_id', userId),
                database_1.supabase.from('user_agreements').select('agreement_type, accepted_at').eq('user_id', userId),
                database_1.supabase.from('marketing_preferences').select('email_opted_in, email_opted_out, email_opted_in_at, email_opted_out_at').eq('user_id', userId),
                database_1.supabase.from('access_logs').select('action, success, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
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
        });
    }
    getUserProfile(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId) {
                throw new Error('User ID is required');
            }
            const { data, error } = yield database_1.supabase
                .from('user_profiles')
                .select('id, email, full_name, phone, created_at')
                .eq('id', userId)
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching user profile');
                throw new Error('Failed to fetch user profile');
            }
            return data;
        });
    }
}
exports.UserService = UserService;
