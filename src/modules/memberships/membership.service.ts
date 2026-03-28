import { supabase } from '../../config/database';
import { stripe } from '../../config/stripe';
import { EmailService } from '../email/email.service';
import { MembershipEmailData } from '../email/email.types';
import { logger } from '../../shared/utils/logger';
import {
  CreatePlanBody,
  UpdatePlanBody,
  MembershipBenefits,
  MembershipPlan,
  Membership,
  LocationMembershipSettings,
} from './membership.types';

export class MembershipService {

  // =====================================================
  // PLAN CRUD (Employee)
  // =====================================================

  async createPlan(data: CreatePlanBody): Promise<MembershipPlan> {
    const { locationId, name, description, monthlyPrice, annualPrice, benefits, sortOrder } = data;

    if (!locationId || !name || monthlyPrice == null) {
      throw new Error('locationId, name, and monthlyPrice are required');
    }

    // Create Stripe Product
    const product = await stripe.products.create({
      name,
      description: description || undefined,
      metadata: { location_id: locationId },
    });

    // Create monthly Stripe Price
    const monthlyStripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(monthlyPrice * 100),
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { location_id: locationId, interval: 'monthly' },
    });

    // Optionally create annual Stripe Price
    let annualStripePrice = null;
    if (annualPrice != null) {
      annualStripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(annualPrice * 100),
        currency: 'usd',
        recurring: { interval: 'year' },
        metadata: { location_id: locationId, interval: 'annual' },
      });
    }

    const { data: plan, error } = await supabase
      .from('membership_plans')
      .insert({
        location_id: locationId,
        name,
        description: description || null,
        monthly_price: monthlyPrice,
        annual_price: annualPrice ?? null,
        stripe_product_id: product.id,
        stripe_monthly_price_id: monthlyStripePrice.id,
        stripe_annual_price_id: annualStripePrice?.id ?? null,
        benefits: benefits || {},
        sort_order: sortOrder ?? 0,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error }, 'Error creating membership plan');
      throw new Error('Failed to create membership plan');
    }

    return plan;
  }

  async updatePlan(planId: string, data: UpdatePlanBody): Promise<MembershipPlan> {
    if (!planId) throw new Error('Plan ID is required');

    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.benefits !== undefined) updates.benefits = data.benefits;
    if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    // Fetch current plan once for price changes and Stripe product updates
    const needsStripe = data.monthlyPrice !== undefined || data.annualPrice !== undefined
      || data.name !== undefined || data.description !== undefined;

    if (needsStripe) {
      const { data: existing, error: fetchErr } = await supabase
        .from('membership_plans')
        .select('stripe_product_id, monthly_price, annual_price')
        .eq('id', planId)
        .single();

      if (fetchErr || !existing?.stripe_product_id) {
        throw new Error('Plan not found');
      }

      const stripeProductId = existing.stripe_product_id;

      // Price changes: create new Stripe Prices on the same Product
      if (data.monthlyPrice !== undefined && data.monthlyPrice !== existing.monthly_price) {
        const newPrice = await stripe.prices.create({
          product: stripeProductId,
          unit_amount: Math.round(data.monthlyPrice * 100),
          currency: 'usd',
          recurring: { interval: 'month' },
        });
        updates.monthly_price = data.monthlyPrice;
        updates.stripe_monthly_price_id = newPrice.id;
      }

      if (data.annualPrice !== undefined && data.annualPrice !== existing.annual_price) {
        if (data.annualPrice === null) {
          updates.annual_price = null;
          updates.stripe_annual_price_id = null;
        } else {
          const newPrice = await stripe.prices.create({
            product: stripeProductId,
            unit_amount: Math.round(data.annualPrice * 100),
            currency: 'usd',
            recurring: { interval: 'year' },
          });
          updates.annual_price = data.annualPrice;
          updates.stripe_annual_price_id = newPrice.id;
        }
      }

      // Update the Stripe Product name/description if changed
      if (data.name !== undefined || data.description !== undefined) {
        const productUpdate: Record<string, any> = {};
        if (data.name !== undefined) productUpdate.name = data.name;
        if (data.description !== undefined) productUpdate.description = data.description || '';
        await stripe.products.update(stripeProductId, productUpdate);
      }
    }

    const { data: updated, error } = await supabase
      .from('membership_plans')
      .update(updates)
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      logger.error({ err: error }, 'Error updating membership plan');
      throw new Error('Failed to update membership plan');
    }

    return updated;
  }

  async deactivatePlan(planId: string): Promise<void> {
    if (!planId) throw new Error('Plan ID is required');

    const { error } = await supabase
      .from('membership_plans')
      .update({ is_active: false })
      .eq('id', planId);

    if (error) {
      logger.error({ err: error }, 'Error deactivating membership plan');
      throw new Error('Failed to deactivate membership plan');
    }
  }

  async getPlansForLocation(locationId: string, activeOnly = true): Promise<MembershipPlan[]> {
    if (!locationId) throw new Error('Location ID is required');

    let query = supabase
      .from('membership_plans')
      .select('*')
      .eq('location_id', locationId)
      .order('sort_order', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error }, 'Error fetching membership plans');
      throw new Error('Failed to fetch membership plans');
    }

    return data || [];
  }

  // =====================================================
  // BILLING PORTAL (Customer)
  // =====================================================

  async createBillingPortalSession(userId: string, locationId: string, returnUrl: string): Promise<{ url: string }> {
    // Validate returnUrl against allowed frontend origin to prevent open redirect
    const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:8080';
    if (!returnUrl.startsWith(allowedOrigin)) {
      throw new Error('Invalid returnUrl');
    }

    // Get Stripe customer ID from user profile (1:1 mapping: user = Stripe customer)
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !profile?.stripe_customer_id) {
      throw new Error('No Stripe customer found for this account');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // =====================================================
  // SUBSCRIPTIONS (Customer)
  // =====================================================

  async subscribe(userId: string, planId: string, billingInterval: 'monthly' | 'annual'): Promise<{ url: string | null }> {
    if (!userId || !planId) throw new Error('userId and planId are required');

    // 1. Get the plan
    const { data: plan, error: planErr } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single();

    if (planErr || !plan) throw new Error('Plan not found or inactive');

    const subLocationSettings = await this.getLocationMembershipSettings(plan.location_id);
    if (!subLocationSettings.membershipsEnabled) {
      throw new Error('Memberships are not available at this location');
    }

    // Validate billing interval
    if (billingInterval === 'annual' && !plan.stripe_annual_price_id) {
      throw new Error('Annual billing is not available for this plan');
    }

    const priceId = billingInterval === 'annual'
      ? plan.stripe_annual_price_id!
      : plan.stripe_monthly_price_id!;

    // 2. Check for existing membership at this location
    const { data: existing } = await supabase
      .from('memberships')
      .select('id, status, stripe_subscription_id')
      .eq('user_id', userId)
      .eq('location_id', plan.location_id)
      .in('status', ['active', 'trialing', 'past_due'])
      .maybeSingle();

    if (existing) {
      throw new Error('You already have an active membership at this location');
    }

    // Clean up any orphaned incomplete or cancelled memberships so re-subscribe works
    const { data: staleRows } = await supabase
      .from('memberships')
      .select('id, stripe_subscription_id, status')
      .eq('user_id', userId)
      .eq('location_id', plan.location_id)
      .in('status', ['incomplete', 'canceled', 'incomplete_expired']);

    if (staleRows && staleRows.length > 0) {
      for (const row of staleRows) {
        if (row.status === 'incomplete') {
          try {
            await stripe.subscriptions.cancel(row.stripe_subscription_id);
          } catch (cancelErr: any) {
            logger.warn({ stripeSubscriptionId: row.stripe_subscription_id, err: cancelErr }, 'Failed to cancel orphaned Stripe subscription');
          }
        }
        await supabase.from('memberships').delete().eq('id', row.id);
      }
      logger.info({ count: staleRows.length, userId }, 'Cleaned up stale memberships before re-subscribe');
    }

    // 3. Ensure Stripe Customer
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) throw new Error('User profile not found');

    let stripeCustomerId = profile.stripe_customer_id;

    // Verify the stored customer still exists in Stripe (handles prod/sandbox mismatch)
    if (stripeCustomerId) {
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch (err: any) {
        if (err.code === 'resource_missing') {
          logger.warn({ stripeCustomerId, userId }, 'Stored Stripe customer not found, creating new one');
          stripeCustomerId = null;
        } else {
          throw err;
        }
      }
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.full_name || undefined,
        metadata: { user_id: userId },
      });
      stripeCustomerId = customer.id;

      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId);
    }

    // 4. Create Stripe Checkout Session for subscription
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/dashboard?membership=success`,
      cancel_url: `${frontendUrl}/memberships`,
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_id: planId,
          location_id: plan.location_id,
          billing_interval: billingInterval,
        },
      },
      metadata: {
        user_id: userId,
        plan_id: planId,
        location_id: plan.location_id,
        billing_interval: billingInterval,
      },
    });

    return {
      url: checkoutSession.url,
    };
  }

  async cancelMembership(membershipId: string, userId: string, immediate = false, employeeOverride = false): Promise<{ refundAmount?: number }> {
    const { data: membership, error: fetchErr } = await supabase
      .from('memberships')
      .select('id, stripe_subscription_id, user_id, status, plan_id, location_id, billing_interval, current_period_end')
      .eq('id', membershipId)
      .single();

    if (fetchErr || !membership) throw new Error('Membership not found');
    if (!employeeOverride && membership.user_id !== userId) throw new Error('Access denied');

    if (!['active', 'trialing', 'past_due'].includes(membership.status)) {
      throw new Error('This membership cannot be canceled (current status: ' + membership.status + ')');
    }

    if (immediate) {
      // Cancel immediately with prorated refund
      const deletedSub = await stripe.subscriptions.cancel(membership.stripe_subscription_id, {
        prorate: true,
        invoice_now: true,
      });

      // Stripe creates a final invoice with prorated credits.
      // Retrieve the latest invoice to find the credit amount.
      let refundAmount = 0;
      try {
        const invoices = await stripe.invoices.list({
          subscription: membership.stripe_subscription_id,
          limit: 1,
        });
        const finalInvoice = invoices.data[0];
        if (finalInvoice && finalInvoice.amount_due < 0) {
          // Negative amount = credit owed to customer
          refundAmount = Math.abs(finalInvoice.amount_due);
        } else if (finalInvoice && finalInvoice.ending_balance && finalInvoice.ending_balance < 0) {
          refundAmount = Math.abs(finalInvoice.ending_balance);
        }

        if (refundAmount > 0 && deletedSub.latest_invoice) {
          const latestInvoice = await stripe.invoices.retrieve(deletedSub.latest_invoice as string);
          const chargeId = latestInvoice.charge as string | null;

          if (chargeId) {
            await stripe.refunds.create({
              charge: chargeId,
              amount: refundAmount,
              reason: 'requested_by_customer',
            });
            logger.info({ refundAmountDollars: (refundAmount / 100).toFixed(2), membershipId }, 'Issued prorated refund');
          } else {
            logger.warn({ membershipId }, 'No charge found on latest invoice, skipping refund');
          }
        }
      } catch (refundErr) {
        logger.error({ err: refundErr, membershipId }, 'Error processing prorated refund');
      }

      await supabase
        .from('memberships')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
        })
        .eq('id', membershipId);

      this.sendCancellationEmail(membership, 'immediate', refundAmount);

      return { refundAmount };
    }

    // Cancel at period end — member keeps access until billing cycle ends
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await supabase
      .from('memberships')
      .update({ canceled_at: new Date().toISOString() })
      .eq('id', membershipId);

    this.sendCancellationEmail(membership, 'end_of_period');

    return {};
  }

  async changePlan(membershipId: string, userId: string, newPlanId: string, employeeOverride = false): Promise<void> {
    const { data: membership, error: fetchErr } = await supabase
      .from('memberships')
      .select('id, stripe_subscription_id, user_id, location_id, billing_interval, status')
      .eq('id', membershipId)
      .single();

    if (fetchErr || !membership) throw new Error('Membership not found');
    if (!employeeOverride && membership.user_id !== userId) throw new Error('Access denied');

    if (!['active', 'trialing'].includes(membership.status)) {
      throw new Error('Plan can only be changed on an active membership (current status: ' + membership.status + ')');
    }

    const { data: newPlan, error: planErr } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('id', newPlanId)
      .eq('location_id', membership.location_id)
      .eq('is_active', true)
      .single();

    if (planErr || !newPlan) throw new Error('New plan not found or inactive');

    const newPriceId = membership.billing_interval === 'annual'
      ? newPlan.stripe_annual_price_id
      : newPlan.stripe_monthly_price_id;

    if (!newPriceId) throw new Error('Pricing not available for your billing interval on the new plan');

    // Get current subscription items
    const sub = await stripe.subscriptions.retrieve(membership.stripe_subscription_id);

    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      items: [{
        id: sub.items.data[0].id,
        price: newPriceId,
      }],
      metadata: {
        plan_id: newPlanId,
      },
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
    });

    // Update local record
    await supabase
      .from('memberships')
      .update({
        plan_id: newPlanId,
        canceled_at: null, // re-activate if they had a pending cancellation
      })
      .eq('id', membershipId);
  }

  // =====================================================
  // EMAIL HELPERS
  // =====================================================

  private async sendCancellationEmail(
    membership: { plan_id: string; location_id: string; user_id: string; billing_interval?: string; current_period_end?: string },
    cancelType: 'immediate' | 'end_of_period',
    refundAmount?: number
  ): Promise<void> {
    try {
      const [{ data: plan }, { data: profile }, { data: location }] = await Promise.all([
        supabase.from('membership_plans').select('name, monthly_price, annual_price, benefits').eq('id', membership.plan_id).single(),
        supabase.from('user_profiles').select('full_name, email').eq('id', membership.user_id).single(),
        supabase.from('locations').select('name').eq('id', membership.location_id).single(),
      ]);

      if (!profile?.email || !plan || !location) return;

      const billingInterval = (membership.billing_interval || 'monthly') as 'monthly' | 'annual';

      const emailData: MembershipEmailData = {
        userFullName: profile.full_name || 'Member',
        userEmail: profile.email,
        planName: plan.name,
        billingInterval,
        price: billingInterval === 'annual' ? Number(plan.annual_price || plan.monthly_price) : Number(plan.monthly_price),
        locationName: location.name,
        cancelType,
        refundAmount,
        accessUntil: cancelType === 'end_of_period' && membership.current_period_end
          ? new Date(membership.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : undefined,
      };

      await EmailService.sendMembershipCanceledEmail(membership.location_id, emailData);
    } catch (err) {
      logger.error({ err }, 'Failed to send membership cancellation email');
    }
  }

  // =====================================================
  // QUERIES
  // =====================================================

  async getUserMembership(userId: string, locationId: string): Promise<(Membership & { plan: MembershipPlan }) | null> {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, membership_plans(*)')
      .eq('user_id', userId)
      .eq('location_id', locationId)
      .in('status', ['active', 'trialing', 'past_due', 'incomplete'])
      .maybeSingle();

    if (error) {
      logger.error({ err: error }, 'Error fetching user membership');
      throw new Error('Failed to fetch membership');
    }

    if (!data) return null;

    // Auto-sync from Stripe if local status is stale (e.g. webhook failed)
    if (data.status === 'incomplete' && data.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(data.stripe_subscription_id);
        // If Stripe says it's dead, delete the stale row and return null
        if (['canceled', 'incomplete_expired'].includes(sub.status)) {
          await supabase.from('memberships').delete().eq('id', data.id);
          logger.info({ membershipId: data.id }, 'Cleaned up stale incomplete membership');
          return null;
        }
        const synced = await this.syncFromStripe(data.id, data.stripe_subscription_id);
        if (synced) {
          const { membership_plans, ...membership } = synced;
          return { ...membership, plan: membership_plans };
        }
      } catch (syncErr) {
        logger.error({ err: syncErr }, 'Auto-sync from Stripe failed');
        // If Stripe sub doesn't exist anymore, clean up
        if ((syncErr as any)?.code === 'resource_missing') {
          await supabase.from('memberships').delete().eq('id', data.id);
          return null;
        }
      }
    }

    const { membership_plans, ...membership } = data;
    return { ...membership, plan: membership_plans };
  }

  private async syncFromStripe(membershipId: string, stripeSubscriptionId: string): Promise<any | null> {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

      const updateData: any = { status: sub.status };

      if (sub.current_period_start && typeof sub.current_period_start === 'number') {
        updateData.current_period_start = new Date(sub.current_period_start * 1000).toISOString();
      }
      if (sub.current_period_end && typeof sub.current_period_end === 'number') {
        updateData.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
      }

      await supabase
        .from('memberships')
        .update(updateData)
        .eq('id', membershipId);

      const { data } = await supabase
        .from('memberships')
        .select('*, membership_plans(*)')
        .eq('id', membershipId)
        .single();

      return data;
    } catch (err) {
      logger.error({ err, stripeSubscriptionId }, 'Failed to sync subscription from Stripe');
      return null;
    }
  }

  async getSubscribersForLocation(locationId: string): Promise<any[]> {
    if (!locationId) throw new Error('Location ID is required');

    const { data, error } = await supabase
      .from('memberships')
      .select('*, membership_plans(name, monthly_price, annual_price), user_profiles(email, full_name, phone)')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Error fetching subscribers');
      throw new Error('Failed to fetch subscribers');
    }

    return data || [];
  }

  // =====================================================
  // USAGE TRACKING
  // =====================================================

  async logUsage(membershipId: string, bookingId: string | null, usageType: 'free_minutes' | 'guest_pass', amount: number): Promise<void> {
    const { error } = await supabase
      .from('membership_usage_log')
      .insert({
        membership_id: membershipId,
        booking_id: bookingId,
        usage_type: usageType,
        amount,
      });

    if (error) {
      logger.error({ err: error }, 'Error logging membership usage');
    }
  }

  async getActiveMembershipForUser(userId: string, locationId: string): Promise<(Membership & { benefits: MembershipBenefits }) | null> {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, membership_plans(benefits)')
      .eq('user_id', userId)
      .eq('location_id', locationId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    if (error) {
      logger.error({ err: error }, 'Error fetching active membership');
      return null;
    }

    if (!data) return null;

    const { membership_plans, ...membership } = data;
    return { ...membership, benefits: membership_plans?.benefits || {} };
  }

  // =====================================================
  // LOCATION SETTINGS HELPERS
  // =====================================================

  async getLocationMembershipSettings(locationId: string): Promise<LocationMembershipSettings & { leaguesEnabled: boolean; marketingEnabled: boolean }> {
    const { data, error } = await supabase
      .from('location_settings')
      .select('memberships_enabled, leagues_enabled, marketing_enabled, default_booking_window_days, default_booking_hours_start, default_booking_hours_end, booking_buffer_minutes')
      .eq('location_id', locationId)
      .single();

    if (error || !data) {
      return { membershipsEnabled: false, leaguesEnabled: true, marketingEnabled: false, defaultBookingWindowDays: 7, defaultBookingHours: null, bookingBufferMinutes: 0 };
    }

    return {
      membershipsEnabled: data.memberships_enabled,
      leaguesEnabled: data.leagues_enabled,
      marketingEnabled: data.marketing_enabled ?? false,
      defaultBookingWindowDays: data.default_booking_window_days,
      defaultBookingHours: data.default_booking_hours_start && data.default_booking_hours_end
        ? { start: data.default_booking_hours_start, end: data.default_booking_hours_end }
        : null,
      bookingBufferMinutes: data.booking_buffer_minutes ?? 0,
    };
  }

  async updateLocationMembershipSettings(locationId: string, updates: {
    membershipsEnabled?: boolean;
    leaguesEnabled?: boolean;
    marketingEnabled?: boolean;
    defaultBookingWindowDays?: number;
    defaultBookingHours?: { start: string; end: string } | null;
    bookingBufferMinutes?: number;
  }): Promise<void> {
    const updateFields: any = {};
    if (updates.membershipsEnabled !== undefined) updateFields.memberships_enabled = updates.membershipsEnabled;
    if (updates.leaguesEnabled !== undefined) updateFields.leagues_enabled = updates.leaguesEnabled;
    if (updates.marketingEnabled !== undefined) updateFields.marketing_enabled = updates.marketingEnabled;
    if (updates.defaultBookingWindowDays !== undefined) updateFields.default_booking_window_days = updates.defaultBookingWindowDays;
    if (updates.defaultBookingHours !== undefined) {
      updateFields.default_booking_hours_start = updates.defaultBookingHours?.start ?? null;
      updateFields.default_booking_hours_end = updates.defaultBookingHours?.end ?? null;
    }
    if (updates.bookingBufferMinutes !== undefined) {
      if (updates.bookingBufferMinutes < 0 || updates.bookingBufferMinutes > 60 || updates.bookingBufferMinutes % 15 !== 0) {
        throw new Error('Buffer must be 0, 15, 30, 45, or 60 minutes');
      }
      updateFields.booking_buffer_minutes = updates.bookingBufferMinutes;
    }

    const { error } = await supabase
      .from('location_settings')
      .update(updateFields)
      .eq('location_id', locationId);

    if (error) {
      logger.error({ err: error }, 'Error updating location settings');
      throw new Error('Failed to update settings');
    }

    // When memberships are disabled, cancel all active subscriptions at period end
    if (updates.membershipsEnabled === false) {
      const { data: activeMembers } = await supabase
        .from('memberships')
        .select('id, stripe_subscription_id')
        .eq('location_id', locationId)
        .in('status', ['active', 'trialing'])
        .is('canceled_at', null);

      if (activeMembers && activeMembers.length > 0) {
        let canceledCount = 0;
        for (const member of activeMembers) {
          try {
            await stripe.subscriptions.update(member.stripe_subscription_id, {
              cancel_at_period_end: true,
            });
            await supabase
              .from('memberships')
              .update({ canceled_at: new Date().toISOString() })
              .eq('id', member.id);
            canceledCount++;
          } catch (err) {
            logger.error({ err, membershipId: member.id }, 'Failed to cancel subscription at period end');
          }
        }
        logger.info({ locationId, canceledCount, total: activeMembers.length }, 'Memberships disabled — subscriptions set to cancel at period end');
      }
    }
  }
}
