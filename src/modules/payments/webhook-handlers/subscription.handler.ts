import Stripe from 'stripe';
import { supabase } from '../../../config/database';
import { EmailService } from '../../email/email.service';
import { logger } from '../../../shared/utils/logger';

const safeTimestamp = (ts: number | null | undefined): string | null => {
  if (!ts || typeof ts !== 'number') return null;
  const d = new Date(ts * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

async function sendMembershipWelcomeEmailFromWebhook(
  subscription: Stripe.Subscription,
  userId: string,
  planId?: string,
  locationId?: string,
): Promise<void> {
  try {
    if (!planId || !locationId) return;

    const { data: membership } = await supabase
      .from('memberships')
      .select('*, membership_plans(*)')
      .eq('stripe_subscription_id', subscription.id)
      .single();
    if (!membership) return;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single();

    if (!profile?.email || !location) return;

    const plan = membership.membership_plans;
    const benefits = plan.benefits || {};

    await EmailService.sendMembershipWelcomeEmail(locationId, {
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
  } catch (err) {
    logger.error({ err }, 'Failed to send membership welcome email');
  }
}

/** Handles `customer.subscription.{created,updated,deleted}` events. */
export async function handleSubscriptionEvent(
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const subMeta = subscription.metadata || {};
  const subUserId = subMeta.user_id;
  const subPlanId = subMeta.plan_id;
  const subLocationId = subMeta.location_id;

  if (!subUserId) {
    logger.warn({ eventType: event.type }, 'Subscription webhook has no user_id metadata, ignoring');
    return;
  }

  // Map Stripe subscription status to our status (currently a 1:1 mapping
  // except `cancel_at_period_end` bookings stay 'active' until period end).
  let membershipStatus = subscription.status as string;
  if (subscription.status === 'active' && subscription.cancel_at_period_end) {
    membershipStatus = 'active';
  }

  if (event.type === 'customer.subscription.created') {
    logger.info({ userId: subUserId, planId: subPlanId }, 'Subscription created');

    const { data: existingMem } = await supabase
      .from('memberships')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    const periodStart = safeTimestamp(subscription.current_period_start);
    const periodEnd = safeTimestamp(subscription.current_period_end);
    const billingInterval = subMeta.billing_interval || 'monthly';

    if (!existingMem && subPlanId && subLocationId) {
      // Created via Stripe Checkout — insert the membership row
      const { error: insertErr } = await supabase
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
        logger.error({ err: insertErr, subscriptionId: subscription.id }, 'Error creating membership from webhook');
      } else {
        logger.info({ userId: subUserId, subscriptionId: subscription.id }, 'Membership created from Checkout Session webhook');
        if (subscription.status === 'active') {
          await sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
        }
      }
    } else if (existingMem && subscription.status === 'active') {
      const updateFields: Record<string, string> = { status: 'active' };
      if (periodStart) updateFields.current_period_start = periodStart;
      if (periodEnd) updateFields.current_period_end = periodEnd;

      await supabase
        .from('memberships')
        .update(updateFields)
        .eq('stripe_subscription_id', subscription.id);

      await sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
    }
    return;
  }

  if (event.type === 'customer.subscription.updated') {
    logger.info({ userId: subUserId, status: subscription.status }, 'Subscription updated');

    const previousAttributes = (event.data as Stripe.Event.Data & {
      previous_attributes?: Partial<Stripe.Subscription>;
    }).previous_attributes;
    const wasIncomplete =
      previousAttributes?.status && previousAttributes.status !== 'active' && subscription.status === 'active';

    const updateData: Record<string, string | null> = { status: membershipStatus };
    const periodStart = safeTimestamp(subscription.current_period_start);
    const periodEnd = safeTimestamp(subscription.current_period_end);
    if (periodStart) updateData.current_period_start = periodStart;
    if (periodEnd) updateData.current_period_end = periodEnd;
    if (subPlanId) updateData.plan_id = subPlanId;
    updateData.canceled_at = subscription.cancel_at_period_end ? new Date().toISOString() : null;

    await supabase
      .from('memberships')
      .update(updateData)
      .eq('stripe_subscription_id', subscription.id);

    if (wasIncomplete) {
      await sendMembershipWelcomeEmailFromWebhook(subscription, subUserId, subPlanId, subLocationId);
    }
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    logger.info({ userId: subUserId }, 'Subscription deleted');
    await supabase
      .from('memberships')
      .update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscription.id);
  }
}

/** Handles `invoice.paid` — subscription renewal or initial charge. */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subId = invoice.subscription as string | null;
  if (!subId) return;

  if (invoice.billing_reason === 'subscription_cycle') {
    // Renewal — reset usage counters
    logger.info({ subscriptionId: subId }, 'Subscription renewal invoice paid, resetting usage counters');
    const { error } = await supabase
      .from('memberships')
      .update({ status: 'active', free_minutes_used: 0, guest_passes_used: 0 })
      .eq('stripe_subscription_id', subId);
    if (error) logger.error({ err: error, subscriptionId: subId }, 'Error resetting usage for subscription');
  } else {
    // Initial invoice — just ensure active status
    logger.info({ subscriptionId: subId, billingReason: invoice.billing_reason }, 'Invoice paid for subscription');
    await supabase
      .from('memberships')
      .update({ status: 'active' })
      .eq('stripe_subscription_id', subId);
  }
}

/** Handles `invoice.payment_failed` — mark membership past_due. */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subId = invoice.subscription as string | null;
  if (!subId) return;

  logger.info({ subscriptionId: subId }, 'Invoice payment failed');
  await supabase
    .from('memberships')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subId);
}
