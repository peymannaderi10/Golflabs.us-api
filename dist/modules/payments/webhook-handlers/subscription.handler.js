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
exports.handleSubscriptionEvent = handleSubscriptionEvent;
exports.handleInvoicePaid = handleInvoicePaid;
exports.handleInvoicePaymentFailed = handleInvoicePaymentFailed;
const database_1 = require("../../../config/database");
const email_service_1 = require("../../email/email.service");
const logger_1 = require("../../../shared/utils/logger");
const safeTimestamp = (ts) => {
    if (!ts || typeof ts !== 'number')
        return null;
    const d = new Date(ts * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString();
};
function sendMembershipWelcomeEmailFromWebhook(subscription, userId, planId, locationId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!planId || !locationId)
                return;
            const { data: membership } = yield database_1.supabase
                .from('memberships')
                .select('*, membership_plans(*)')
                .eq('stripe_subscription_id', subscription.id)
                .single();
            if (!membership)
                return;
            const { data: profile } = yield database_1.supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', userId)
                .single();
            const { data: location } = yield database_1.supabase
                .from('locations')
                .select('name')
                .eq('id', locationId)
                .single();
            if (!(profile === null || profile === void 0 ? void 0 : profile.email) || !location)
                return;
            const plan = membership.membership_plans;
            const benefits = plan.benefits || {};
            yield email_service_1.EmailService.sendMembershipWelcomeEmail(locationId, {
                userFullName: profile.full_name || 'Member',
                userEmail: profile.email,
                planName: plan.name,
                billingInterval: membership.billing_interval,
                price: membership.billing_interval === 'annual' ? Number(plan.annual_price || plan.monthly_price) : Number(plan.monthly_price),
                locationName: location.name,
                freeHoursPerMonth: benefits.freeMinutesPerMonth ? benefits.freeMinutesPerMonth / 60 : undefined,
                bookingWindowDays: benefits.bookingWindowDays,
                guestPassesPerMonth: benefits.guestPassesPerMonth,
                renewalDate: membership.current_period_end
                    ? new Date(membership.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : undefined,
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Failed to send membership welcome email');
        }
    });
}
/** Handles `customer.subscription.{created,updated,deleted}` events. */
function handleSubscriptionEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const subscription = event.data.object;
        const subMeta = subscription.metadata || {};
        const subUserId = subMeta.user_id;
        const subPlanId = subMeta.plan_id;
        const subLocationId = subMeta.location_id;
        if (!subUserId) {
            logger_1.logger.warn({ eventType: event.type }, 'Subscription webhook has no user_id metadata, ignoring');
            return;
        }
        // Map Stripe subscription status to our status (currently a 1:1 mapping
        // except `cancel_at_period_end` bookings stay 'active' until period end).
        let membershipStatus = subscription.status;
        if (subscription.status === 'active' && subscription.cancel_at_period_end) {
            membershipStatus = 'active';
        }
        if (event.type === 'customer.subscription.created') {
            logger_1.logger.info({ userId: subUserId, planId: subPlanId }, 'Subscription created');
            const { data: existingMem } = yield database_1.supabase
                .from('memberships')
                .select('id')
                .eq('stripe_subscription_id', subscription.id)
                .maybeSingle();
            const periodStart = safeTimestamp(subscription.current_period_start);
            const periodEnd = safeTimestamp(subscription.current_period_end);
            const billingInterval = subMeta.billing_interval || 'monthly';
            if (!existingMem && subPlanId && subLocationId) {
                // Created via Stripe Checkout — insert the membership row
                const { error: insertErr } = yield database_1.supabase
                    .from('memberships')
                    .insert({
                    user_id: subUserId,
                    plan_id: subPlanId,
                    location_id: subLocationId,
                    stripe_subscription_id: subscription.id,
                    status: subscription.status === 'active' ? 'active' : 'incomplete',
                    billing_interval: billingInterval,
                    current_period_start: periodStart,
                    current_period_end: periodEnd,
                });
                if (insertErr) {
                    logger_1.logger.error({ err: insertErr, subscriptionId: subscription.id }, 'Error creating membership from webhook');
                }
                else {
                    logger_1.logger.info({ userId: subUserId, subscriptionId: subscription.id }, 'Membership created from Checkout Session webhook');
                    if (subscription.status === 'active') {
                        yield sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
                    }
                }
            }
            else if (existingMem && subscription.status === 'active') {
                const updateFields = { status: 'active' };
                if (periodStart)
                    updateFields.current_period_start = periodStart;
                if (periodEnd)
                    updateFields.current_period_end = periodEnd;
                yield database_1.supabase
                    .from('memberships')
                    .update(updateFields)
                    .eq('stripe_subscription_id', subscription.id);
                yield sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
            }
            return;
        }
        if (event.type === 'customer.subscription.updated') {
            logger_1.logger.info({ userId: subUserId, status: subscription.status }, 'Subscription updated');
            const previousAttributes = event.data.previous_attributes;
            const wasIncomplete = (previousAttributes === null || previousAttributes === void 0 ? void 0 : previousAttributes.status) && previousAttributes.status !== 'active' && subscription.status === 'active';
            const updateData = { status: membershipStatus };
            const periodStart = safeTimestamp(subscription.current_period_start);
            const periodEnd = safeTimestamp(subscription.current_period_end);
            if (periodStart)
                updateData.current_period_start = periodStart;
            if (periodEnd)
                updateData.current_period_end = periodEnd;
            if (subPlanId)
                updateData.plan_id = subPlanId;
            updateData.canceled_at = subscription.cancel_at_period_end ? new Date().toISOString() : null;
            yield database_1.supabase
                .from('memberships')
                .update(updateData)
                .eq('stripe_subscription_id', subscription.id);
            if (wasIncomplete) {
                yield sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
            }
            return;
        }
        if (event.type === 'customer.subscription.deleted') {
            logger_1.logger.info({ userId: subUserId }, 'Subscription deleted');
            yield database_1.supabase
                .from('memberships')
                .update({ status: 'canceled', canceled_at: new Date().toISOString() })
                .eq('stripe_subscription_id', subscription.id);
        }
    });
}
/** Handles `invoice.paid` — subscription renewal or initial charge. */
function handleInvoicePaid(invoice) {
    return __awaiter(this, void 0, void 0, function* () {
        const subId = invoice.subscription;
        if (!subId)
            return;
        if (invoice.billing_reason === 'subscription_cycle') {
            // Renewal — reset usage counters
            logger_1.logger.info({ subscriptionId: subId }, 'Subscription renewal invoice paid, resetting usage counters');
            const { error } = yield database_1.supabase
                .from('memberships')
                .update({ status: 'active', free_minutes_used: 0, guest_passes_used: 0 })
                .eq('stripe_subscription_id', subId);
            if (error)
                logger_1.logger.error({ err: error, subscriptionId: subId }, 'Error resetting usage for subscription');
        }
        else {
            // Initial invoice — just ensure active status
            logger_1.logger.info({ subscriptionId: subId, billingReason: invoice.billing_reason }, 'Invoice paid for subscription');
            yield database_1.supabase
                .from('memberships')
                .update({ status: 'active' })
                .eq('stripe_subscription_id', subId);
        }
    });
}
/** Handles `invoice.payment_failed` — mark membership past_due. */
function handleInvoicePaymentFailed(invoice) {
    return __awaiter(this, void 0, void 0, function* () {
        const subId = invoice.subscription;
        if (!subId)
            return;
        logger_1.logger.info({ subscriptionId: subId }, 'Invoice payment failed');
        yield database_1.supabase
            .from('memberships')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subId);
    });
}
