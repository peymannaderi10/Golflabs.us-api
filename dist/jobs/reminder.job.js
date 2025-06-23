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
exports.enqueueReminders = enqueueReminders;
const database_1 = require("../config/database");
const resend_1 = require("../config/resend");
const email_service_1 = require("../modules/email/email.service");
/**
 * Generate unlock token for booking - this would need to match your existing unlock token logic
 * For now, using a simple implementation
 */
function generateUnlockToken(bookingId, startTime, endTime) {
    // This should match your existing token generation logic
    // Using a simple base64 encoding for demo - replace with your actual implementation
    const tokenData = {
        bookingId,
        startTime,
        endTime,
        expires: new Date(endTime).getTime()
    };
    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
}
/**
 * Process booking reminders for sessions starting in ~15 minutes
 */
function enqueueReminders() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const now = Date.now();
            const remindAt = new Date(now + 15 * 60 * 1000).toISOString(); // 15 minutes from now
            const windowStart = new Date(now + 14 * 60 * 1000).toISOString(); // 14 minutes from now
            console.log(`[Reminder Job] Looking for bookings starting between ${windowStart} and ${remindAt}`);
            // Find confirmed bookings starting in ~15 minutes
            const { data: upcomingBookings, error } = yield database_1.supabase
                .from('bookings')
                .select('id, user_id, location_id, start_time, end_time')
                .eq('status', 'confirmed')
                .gte('start_time', windowStart)
                .lte('start_time', remindAt);
            if (error) {
                console.error('[Reminder Job] Error fetching upcoming bookings:', error);
                return;
            }
            if (!upcomingBookings || upcomingBookings.length === 0) {
                return;
            }
            console.log(`[Reminder Job] Found ${upcomingBookings.length} bookings needing reminders`);
            // BATCH OPERATION: Check which bookings already have reminder notifications
            const bookingIds = upcomingBookings.map(booking => booking.id);
            const { data: existingReminders, error: reminderError } = yield database_1.supabase
                .from('notifications')
                .select('booking_id')
                .in('booking_id', bookingIds)
                .eq('type', 'reminder');
            if (reminderError) {
                console.error('[Reminder Job] Error checking existing reminders:', reminderError);
                return;
            }
            // Create a Set for fast lookup of existing reminders
            const existingReminderIds = new Set((existingReminders || []).map(reminder => reminder.booking_id));
            // Filter out bookings that already have reminders
            const bookingsNeedingReminders = upcomingBookings.filter(booking => !existingReminderIds.has(booking.id));
            if (bookingsNeedingReminders.length === 0) {
                console.log('[Reminder Job] All upcoming bookings already have reminders');
                return;
            }
            console.log(`[Reminder Job] Processing ${bookingsNeedingReminders.length} bookings without reminders`);
            // BATCH OPERATION: Prepare all booking updates
            const bookingUpdates = bookingsNeedingReminders.map(booking => {
                const token = generateUnlockToken(booking.id, booking.start_time, booking.end_time);
                return {
                    id: booking.id,
                    unlock_token: token,
                    unlock_token_expires_at: booking.end_time
                };
            });
            // BATCH OPERATION: Update all bookings with unlock tokens at once
            if (bookingUpdates.length > 0) {
                const { error: updateError } = yield database_1.supabase
                    .from('bookings')
                    .upsert(bookingUpdates, {
                    onConflict: 'id',
                    ignoreDuplicates: false
                });
                if (updateError) {
                    console.error('[Reminder Job] Error batch updating booking tokens:', updateError);
                    return;
                }
            }
            // Process reminder emails (these need to be individual due to email service design)
            for (const booking of bookingsNeedingReminders) {
                try {
                    const token = generateUnlockToken(booking.id, booking.start_time, booking.end_time);
                    const unlockLink = `${resend_1.resendConfig.frontendUrl}/unlock?token=${token}`;
                    // Queue the reminder email
                    yield email_service_1.EmailService.sendReminderEmail(booking.id, token, unlockLink);
                    console.log(`[Reminder Job] Queued reminder for booking ${booking.id}`);
                }
                catch (error) {
                    console.error(`[Reminder Job] Error processing reminder for booking ${booking.id}:`, error);
                }
            }
        }
        catch (error) {
            console.error('[Reminder Job] Error in enqueueReminders:', error);
        }
    });
}
