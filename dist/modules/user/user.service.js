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
const stripe_1 = require("../../config/stripe");
const logger_1 = require("../../shared/utils/logger");
class UserService {
    deleteAccount(userId) {
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
                // 1. Anonymize bookings -- null out user_id but keep the record for financial audit
                yield database_1.supabase
                    .from('bookings')
                    .update({ user_id: null, notes: null })
                    .eq('user_id', userId);
                // 2. Anonymize access logs -- remove PII fields
                yield database_1.supabase
                    .from('access_logs')
                    .update({ user_id: null, ip_address: null, user_agent: null })
                    .eq('user_id', userId);
                // 3. Anonymize agreement records -- keep for legal compliance but redact PII
                yield database_1.supabase
                    .from('user_agreements')
                    .update({ signer_name: '[deleted]', signer_email: '[deleted]', ip_address: null, user_agent: null })
                    .eq('user_id', userId);
                // 4. Delete marketing data entirely
                yield database_1.supabase.from('campaign_recipients').delete().eq('user_id', userId);
                yield database_1.supabase.from('marketing_preferences').delete().eq('user_id', userId);
                // 5. Delete notifications
                yield database_1.supabase.from('notifications').delete().eq('user_id', userId);
                // 6. Delete Stripe customer if exists
                if (existingUser.stripe_customer_id) {
                    try {
                        yield stripe_1.stripe.customers.del(existingUser.stripe_customer_id);
                    }
                    catch (stripeErr) {
                        logger_1.logger.warn({ err: stripeErr, stripeCustomerId: existingUser.stripe_customer_id }, 'Failed to delete Stripe customer');
                    }
                }
                // 7. Delete user profile
                const { error: deleteProfileError } = yield database_1.supabase
                    .from('user_profiles')
                    .delete()
                    .eq('id', userId);
                if (deleteProfileError) {
                    logger_1.logger.error({ err: deleteProfileError }, 'Error deleting user profile');
                    throw new Error('Failed to delete user profile');
                }
                // 8. Delete auth user
                const { error: deleteAuthError } = yield database_1.supabase.auth.admin.deleteUser(userId);
                if (deleteAuthError) {
                    logger_1.logger.warn({ err: deleteAuthError }, 'Auth user deletion failed after profile deletion');
                }
                logger_1.logger.info({ userId }, 'Account fully deleted and data anonymized');
                return {
                    success: true,
                    message: 'Account and personal data deleted successfully.'
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
                database_1.supabase.from('bookings').select('id, location_id, bay_id, start_time, end_time, total_amount, status, party_size, created_at').eq('user_id', userId),
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
