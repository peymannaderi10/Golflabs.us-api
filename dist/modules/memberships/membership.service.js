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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipService = void 0;
const database_1 = require("../../config/database");
const stripe_1 = require("../../config/stripe");
const email_service_1 = require("../email/email.service");
const logger_1 = require("../../shared/utils/logger");
const location_service_1 = require("../locations/location.service");
class MembershipService {
    // =====================================================
    // PLAN CRUD (Employee)
    // =====================================================
    createPlan(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { locationId, name, description, monthlyPrice, annualPrice, benefits, sortOrder } = data;
            if (!locationId || !name || monthlyPrice == null) {
                throw new Error('locationId, name, and monthlyPrice are required');
            }
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(locationId);
            // Create Stripe Product
            const product = yield stripe_1.stripe.products.create({
                name,
                description: description || undefined,
                metadata: { location_id: locationId },
            }, stripeOpts);
            // Create monthly Stripe Price
            const monthlyStripePrice = yield stripe_1.stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(monthlyPrice * 100),
                currency: 'usd',
                recurring: { interval: 'month' },
                metadata: { location_id: locationId, interval: 'monthly' },
            }, stripeOpts);
            // Optionally create annual Stripe Price
            let annualStripePrice = null;
            if (annualPrice != null) {
                annualStripePrice = yield stripe_1.stripe.prices.create({
                    product: product.id,
                    unit_amount: Math.round(annualPrice * 100),
                    currency: 'usd',
                    recurring: { interval: 'year' },
                    metadata: { location_id: locationId, interval: 'annual' },
                }, stripeOpts);
            }
            const { data: plan, error } = yield database_1.supabase
                .from('membership_plans')
                .insert({
                location_id: locationId,
                name,
                description: description || null,
                monthly_price: monthlyPrice,
                annual_price: annualPrice !== null && annualPrice !== void 0 ? annualPrice : null,
                stripe_product_id: product.id,
                stripe_monthly_price_id: monthlyStripePrice.id,
                stripe_annual_price_id: (_a = annualStripePrice === null || annualStripePrice === void 0 ? void 0 : annualStripePrice.id) !== null && _a !== void 0 ? _a : null,
                benefits: benefits || {},
                sort_order: sortOrder !== null && sortOrder !== void 0 ? sortOrder : 0,
            })
                .select()
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error creating membership plan');
                throw new Error('Failed to create membership plan');
            }
            return plan;
        });
    }
    getPlanLocationId(planId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data } = yield database_1.supabase
                .from('membership_plans')
                .select('location_id')
                .eq('id', planId)
                .single();
            return (_a = data === null || data === void 0 ? void 0 : data.location_id) !== null && _a !== void 0 ? _a : null;
        });
    }
    getMembershipLocationId(membershipId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data } = yield database_1.supabase
                .from('memberships')
                .select('location_id')
                .eq('id', membershipId)
                .single();
            return (_a = data === null || data === void 0 ? void 0 : data.location_id) !== null && _a !== void 0 ? _a : null;
        });
    }
    updatePlan(planId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!planId)
                throw new Error('Plan ID is required');
            const updates = {};
            if (data.name !== undefined)
                updates.name = data.name;
            if (data.description !== undefined)
                updates.description = data.description;
            if (data.benefits !== undefined)
                updates.benefits = data.benefits;
            if (data.sortOrder !== undefined)
                updates.sort_order = data.sortOrder;
            if (data.isActive !== undefined)
                updates.is_active = data.isActive;
            // Fetch current plan once for price changes and Stripe product updates
            const needsStripe = data.monthlyPrice !== undefined || data.annualPrice !== undefined
                || data.name !== undefined || data.description !== undefined;
            if (needsStripe) {
                const { data: existing, error: fetchErr } = yield database_1.supabase
                    .from('membership_plans')
                    .select('stripe_product_id, monthly_price, annual_price, location_id')
                    .eq('id', planId)
                    .single();
                if (fetchErr || !(existing === null || existing === void 0 ? void 0 : existing.stripe_product_id)) {
                    throw new Error('Plan not found');
                }
                const stripeProductId = existing.stripe_product_id;
                const stripeOpts = yield (0, stripe_1.getStripeOptions)(existing.location_id);
                // Price changes: create new Stripe Prices on the same Product
                if (data.monthlyPrice !== undefined && data.monthlyPrice !== existing.monthly_price) {
                    const newPrice = yield stripe_1.stripe.prices.create({
                        product: stripeProductId,
                        unit_amount: Math.round(data.monthlyPrice * 100),
                        currency: 'usd',
                        recurring: { interval: 'month' },
                    }, stripeOpts);
                    updates.monthly_price = data.monthlyPrice;
                    updates.stripe_monthly_price_id = newPrice.id;
                }
                if (data.annualPrice !== undefined && data.annualPrice !== existing.annual_price) {
                    if (data.annualPrice === null) {
                        updates.annual_price = null;
                        updates.stripe_annual_price_id = null;
                    }
                    else {
                        const newPrice = yield stripe_1.stripe.prices.create({
                            product: stripeProductId,
                            unit_amount: Math.round(data.annualPrice * 100),
                            currency: 'usd',
                            recurring: { interval: 'year' },
                        }, stripeOpts);
                        updates.annual_price = data.annualPrice;
                        updates.stripe_annual_price_id = newPrice.id;
                    }
                }
                // Update the Stripe Product name/description if changed
                if (data.name !== undefined || data.description !== undefined) {
                    const productUpdate = {};
                    if (data.name !== undefined)
                        productUpdate.name = data.name;
                    if (data.description !== undefined)
                        productUpdate.description = data.description || '';
                    yield stripe_1.stripe.products.update(stripeProductId, productUpdate, stripeOpts);
                }
            }
            const { data: updated, error } = yield database_1.supabase
                .from('membership_plans')
                .update(updates)
                .eq('id', planId)
                .select()
                .single();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error updating membership plan');
                throw new Error('Failed to update membership plan');
            }
            return updated;
        });
    }
    deactivatePlan(planId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!planId)
                throw new Error('Plan ID is required');
            const { error } = yield database_1.supabase
                .from('membership_plans')
                .update({ is_active: false })
                .eq('id', planId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error deactivating membership plan');
                throw new Error('Failed to deactivate membership plan');
            }
        });
    }
    getPlansForLocation(locationId_1) {
        return __awaiter(this, arguments, void 0, function* (locationId, activeOnly = true) {
            if (!locationId)
                throw new Error('Location ID is required');
            let query = database_1.supabase
                .from('membership_plans')
                .select('*')
                .eq('location_id', locationId)
                .order('sort_order', { ascending: true });
            if (activeOnly) {
                query = query.eq('is_active', true);
            }
            const { data, error } = yield query;
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching membership plans');
                throw new Error('Failed to fetch membership plans');
            }
            return data || [];
        });
    }
    // =====================================================
    // BILLING PORTAL (Customer)
    // =====================================================
    createBillingPortalSession(userId, locationId, returnUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Validate returnUrl against allowed frontend origin to prevent open redirect
            const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:8080';
            if (!returnUrl.startsWith(allowedOrigin)) {
                throw new Error('Invalid returnUrl');
            }
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(locationId);
            // Resolve Stripe customer for this user + location
            let customerId = null;
            if (stripeOpts) {
                // Connected account — look up customer_stripe_accounts
                const { data: csa } = yield database_1.supabase
                    .from('customer_stripe_accounts')
                    .select('stripe_customer_id')
                    .eq('user_id', userId)
                    .eq('stripe_account_id', stripeOpts.stripeAccount)
                    .maybeSingle();
                customerId = (_a = csa === null || csa === void 0 ? void 0 : csa.stripe_customer_id) !== null && _a !== void 0 ? _a : null;
            }
            else {
                // Platform account — use user_profiles
                const { data: profile } = yield database_1.supabase
                    .from('user_profiles')
                    .select('stripe_customer_id')
                    .eq('id', userId)
                    .single();
                customerId = (_b = profile === null || profile === void 0 ? void 0 : profile.stripe_customer_id) !== null && _b !== void 0 ? _b : null;
            }
            if (!customerId) {
                throw new Error('No Stripe customer found for this account');
            }
            const session = yield stripe_1.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            }, stripeOpts);
            return { url: session.url };
        });
    }
    // =====================================================
    // SUBSCRIPTIONS (Customer)
    // =====================================================
    subscribe(userId, planId, billingInterval) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!userId || !planId)
                throw new Error('userId and planId are required');
            // 1. Get the plan
            const { data: plan, error: planErr } = yield database_1.supabase
                .from('membership_plans')
                .select('*')
                .eq('id', planId)
                .eq('is_active', true)
                .single();
            if (planErr || !plan)
                throw new Error('Plan not found or inactive');
            const subLocationSettings = yield this.getLocationMembershipSettings(plan.location_id);
            if (!subLocationSettings.membershipsEnabled) {
                throw new Error('Memberships are not available at this location');
            }
            // Validate billing interval
            if (billingInterval === 'annual' && !plan.stripe_annual_price_id) {
                throw new Error('Annual billing is not available for this plan');
            }
            const priceId = billingInterval === 'annual'
                ? plan.stripe_annual_price_id
                : plan.stripe_monthly_price_id;
            // 2. Check for existing membership at this location
            const { data: existing } = yield database_1.supabase
                .from('memberships')
                .select('id, status, stripe_subscription_id')
                .eq('user_id', userId)
                .eq('location_id', plan.location_id)
                .in('status', ['active', 'trialing', 'past_due'])
                .maybeSingle();
            if (existing) {
                throw new Error('You already have an active membership at this location');
            }
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(plan.location_id);
            // Clean up any orphaned incomplete or cancelled memberships so re-subscribe works
            const { data: staleRows } = yield database_1.supabase
                .from('memberships')
                .select('id, stripe_subscription_id, status')
                .eq('user_id', userId)
                .eq('location_id', plan.location_id)
                .in('status', ['incomplete', 'canceled', 'incomplete_expired']);
            if (staleRows && staleRows.length > 0) {
                for (const row of staleRows) {
                    if (row.status === 'incomplete') {
                        try {
                            yield stripe_1.stripe.subscriptions.cancel(row.stripe_subscription_id, stripeOpts);
                        }
                        catch (cancelErr) {
                            logger_1.logger.warn({ stripeSubscriptionId: row.stripe_subscription_id, err: cancelErr }, 'Failed to cancel orphaned Stripe subscription');
                        }
                    }
                    yield database_1.supabase.from('memberships').delete().eq('id', row.id);
                }
                logger_1.logger.info({ count: staleRows.length, userId }, 'Cleaned up stale memberships before re-subscribe');
            }
            // 3. Ensure Stripe Customer scoped to the correct account
            const { customerId: stripeCustomerId } = yield (0, stripe_1.getOrCreateCustomerForLocation)(userId, plan.location_id);
            // 4. Create Stripe Checkout Session for subscription
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
            const checkoutSession = yield stripe_1.stripe.checkout.sessions.create({
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
            }, stripeOpts);
            return {
                url: checkoutSession.url,
            };
        });
    }
    cancelMembership(membershipId_1, userId_1) {
        return __awaiter(this, arguments, void 0, function* (membershipId, userId, immediate = false, employeeOverride = false) {
            const { data: membership, error: fetchErr } = yield database_1.supabase
                .from('memberships')
                .select('id, stripe_subscription_id, user_id, status, plan_id, location_id, billing_interval, current_period_end')
                .eq('id', membershipId)
                .single();
            if (fetchErr || !membership)
                throw new Error('Membership not found');
            if (!employeeOverride && membership.user_id !== userId)
                throw new Error('Access denied');
            if (!['active', 'trialing', 'past_due'].includes(membership.status)) {
                throw new Error('This membership cannot be canceled (current status: ' + membership.status + ')');
            }
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(membership.location_id);
            if (immediate) {
                // Cancel immediately with prorated refund
                const deletedSub = yield stripe_1.stripe.subscriptions.cancel(membership.stripe_subscription_id, {
                    prorate: true,
                    invoice_now: true,
                }, stripeOpts);
                // Stripe creates a final invoice with prorated credits.
                // Retrieve the latest invoice to find the credit amount.
                let refundAmount = 0;
                try {
                    const invoices = yield stripe_1.stripe.invoices.list({
                        subscription: membership.stripe_subscription_id,
                        limit: 1,
                    }, stripeOpts);
                    const finalInvoice = invoices.data[0];
                    if (finalInvoice && finalInvoice.amount_due < 0) {
                        // Negative amount = credit owed to customer
                        refundAmount = Math.abs(finalInvoice.amount_due);
                    }
                    else if (finalInvoice && finalInvoice.ending_balance && finalInvoice.ending_balance < 0) {
                        refundAmount = Math.abs(finalInvoice.ending_balance);
                    }
                    if (refundAmount > 0 && deletedSub.latest_invoice) {
                        const latestInvoice = yield stripe_1.stripe.invoices.retrieve(deletedSub.latest_invoice, stripeOpts);
                        const chargeId = latestInvoice.charge;
                        if (chargeId) {
                            yield stripe_1.stripe.refunds.create({
                                charge: chargeId,
                                amount: refundAmount,
                                reason: 'requested_by_customer',
                            }, stripeOpts);
                            logger_1.logger.info({ refundAmountDollars: (refundAmount / 100).toFixed(2), membershipId }, 'Issued prorated refund');
                        }
                        else {
                            logger_1.logger.warn({ membershipId }, 'No charge found on latest invoice, skipping refund');
                        }
                    }
                }
                catch (refundErr) {
                    logger_1.logger.error({ err: refundErr, membershipId }, 'Error processing prorated refund');
                }
                yield database_1.supabase
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
            yield stripe_1.stripe.subscriptions.update(membership.stripe_subscription_id, {
                cancel_at_period_end: true,
            }, stripeOpts);
            yield database_1.supabase
                .from('memberships')
                .update({ canceled_at: new Date().toISOString() })
                .eq('id', membershipId);
            this.sendCancellationEmail(membership, 'end_of_period');
            return {};
        });
    }
    changePlan(membershipId_1, userId_1, newPlanId_1) {
        return __awaiter(this, arguments, void 0, function* (membershipId, userId, newPlanId, employeeOverride = false) {
            const { data: membership, error: fetchErr } = yield database_1.supabase
                .from('memberships')
                .select('id, stripe_subscription_id, user_id, location_id, billing_interval, status')
                .eq('id', membershipId)
                .single();
            if (fetchErr || !membership)
                throw new Error('Membership not found');
            if (!employeeOverride && membership.user_id !== userId)
                throw new Error('Access denied');
            if (!['active', 'trialing'].includes(membership.status)) {
                throw new Error('Plan can only be changed on an active membership (current status: ' + membership.status + ')');
            }
            const { data: newPlan, error: planErr } = yield database_1.supabase
                .from('membership_plans')
                .select('*')
                .eq('id', newPlanId)
                .eq('location_id', membership.location_id)
                .eq('is_active', true)
                .single();
            if (planErr || !newPlan)
                throw new Error('New plan not found or inactive');
            const newPriceId = membership.billing_interval === 'annual'
                ? newPlan.stripe_annual_price_id
                : newPlan.stripe_monthly_price_id;
            if (!newPriceId)
                throw new Error('Pricing not available for your billing interval on the new plan');
            const stripeOpts = yield (0, stripe_1.getStripeOptions)(membership.location_id);
            // Get current subscription items
            const sub = yield stripe_1.stripe.subscriptions.retrieve(membership.stripe_subscription_id, stripeOpts);
            yield stripe_1.stripe.subscriptions.update(membership.stripe_subscription_id, {
                items: [{
                        id: sub.items.data[0].id,
                        price: newPriceId,
                    }],
                metadata: {
                    plan_id: newPlanId,
                },
                proration_behavior: 'create_prorations',
                cancel_at_period_end: false,
            }, stripeOpts);
            // Update local record
            yield database_1.supabase
                .from('memberships')
                .update({
                plan_id: newPlanId,
                canceled_at: null, // re-activate if they had a pending cancellation
            })
                .eq('id', membershipId);
        });
    }
    // =====================================================
    // EMAIL HELPERS
    // =====================================================
    sendCancellationEmail(membership, cancelType, refundAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [{ data: plan }, { data: profile }, { data: location }] = yield Promise.all([
                    database_1.supabase.from('membership_plans').select('name, monthly_price, annual_price, benefits').eq('id', membership.plan_id).single(),
                    database_1.supabase.from('user_profiles').select('full_name, email').eq('id', membership.user_id).single(),
                    database_1.supabase.from('locations').select('name').eq('id', membership.location_id).single(),
                ]);
                if (!(profile === null || profile === void 0 ? void 0 : profile.email) || !plan || !location)
                    return;
                const billingInterval = (membership.billing_interval || 'monthly');
                const emailData = {
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
                yield email_service_1.EmailService.sendMembershipCanceledEmail(membership.location_id, emailData);
            }
            catch (err) {
                logger_1.logger.error({ err }, 'Failed to send membership cancellation email');
            }
        });
    }
    // =====================================================
    // QUERIES
    // =====================================================
    getUserMembership(userId, locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('memberships')
                .select('*, membership_plans(*)')
                .eq('user_id', userId)
                .eq('location_id', locationId)
                .in('status', ['active', 'trialing', 'past_due', 'incomplete'])
                .maybeSingle();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching user membership');
                throw new Error('Failed to fetch membership');
            }
            if (!data)
                return null;
            // Auto-sync from Stripe if local status is stale (e.g. webhook failed)
            if (data.status === 'incomplete' && data.stripe_subscription_id) {
                try {
                    const stripeOpts = yield (0, stripe_1.getStripeOptions)(locationId);
                    const sub = yield stripe_1.stripe.subscriptions.retrieve(data.stripe_subscription_id, stripeOpts);
                    // If Stripe says it's dead, delete the stale row and return null
                    if (['canceled', 'incomplete_expired'].includes(sub.status)) {
                        yield database_1.supabase.from('memberships').delete().eq('id', data.id);
                        logger_1.logger.info({ membershipId: data.id }, 'Cleaned up stale incomplete membership');
                        return null;
                    }
                    const synced = yield this.syncFromStripe(data.id, data.stripe_subscription_id, stripeOpts);
                    if (synced) {
                        const { membership_plans } = synced, membership = __rest(synced, ["membership_plans"]);
                        return Object.assign(Object.assign({}, membership), { plan: membership_plans });
                    }
                }
                catch (syncErr) {
                    logger_1.logger.error({ err: syncErr }, 'Auto-sync from Stripe failed');
                    // If Stripe sub doesn't exist anymore, clean up
                    if ((syncErr === null || syncErr === void 0 ? void 0 : syncErr.code) === 'resource_missing') {
                        yield database_1.supabase.from('memberships').delete().eq('id', data.id);
                        return null;
                    }
                }
            }
            const { membership_plans } = data, membership = __rest(data, ["membership_plans"]);
            return Object.assign(Object.assign({}, membership), { plan: membership_plans });
        });
    }
    syncFromStripe(membershipId, stripeSubscriptionId, stripeOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sub = yield stripe_1.stripe.subscriptions.retrieve(stripeSubscriptionId, stripeOpts);
                const updateData = { status: sub.status };
                if (sub.current_period_start && typeof sub.current_period_start === 'number') {
                    updateData.current_period_start = new Date(sub.current_period_start * 1000).toISOString();
                }
                if (sub.current_period_end && typeof sub.current_period_end === 'number') {
                    updateData.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
                }
                yield database_1.supabase
                    .from('memberships')
                    .update(updateData)
                    .eq('id', membershipId);
                const { data } = yield database_1.supabase
                    .from('memberships')
                    .select('*, membership_plans(*)')
                    .eq('id', membershipId)
                    .single();
                return data;
            }
            catch (err) {
                logger_1.logger.error({ err, stripeSubscriptionId }, 'Failed to sync subscription from Stripe');
                return null;
            }
        });
    }
    getSubscribersForLocation(locationId_1) {
        return __awaiter(this, arguments, void 0, function* (locationId, page = 1, pageSize = 50) {
            if (!locationId)
                throw new Error('Location ID is required');
            const cappedPageSize = Math.min(pageSize, 100);
            const from = (page - 1) * cappedPageSize;
            const to = from + cappedPageSize - 1;
            const { data, error, count } = yield database_1.supabase
                .from('memberships')
                .select('*, membership_plans(name, monthly_price, annual_price), user_profiles(email, full_name, phone)', { count: 'exact' })
                .eq('location_id', locationId)
                .order('created_at', { ascending: false })
                .range(from, to);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching subscribers');
                throw new Error('Failed to fetch subscribers');
            }
            return { data: data || [], total: count || 0 };
        });
    }
    // =====================================================
    // USAGE TRACKING
    // =====================================================
    logUsage(membershipId, bookingId, usageType, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const { error } = yield database_1.supabase
                .from('membership_usage_log')
                .insert({
                membership_id: membershipId,
                booking_id: bookingId,
                usage_type: usageType,
                amount,
            });
            if (error) {
                logger_1.logger.error({ err: error }, 'Error logging membership usage');
            }
        });
    }
    getActiveMembershipForUser(userId, locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('memberships')
                .select('*, membership_plans(benefits)')
                .eq('user_id', userId)
                .eq('location_id', locationId)
                .in('status', ['active', 'trialing'])
                .maybeSingle();
            if (error) {
                logger_1.logger.error({ err: error }, 'Error fetching active membership');
                return null;
            }
            if (!data)
                return null;
            const { membership_plans } = data, membership = __rest(data, ["membership_plans"]);
            return Object.assign(Object.assign({}, membership), { benefits: (membership_plans === null || membership_plans === void 0 ? void 0 : membership_plans.benefits) || {} });
        });
    }
    // =====================================================
    // LOCATION SETTINGS HELPERS
    // =====================================================
    getLocationMembershipSettings(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            const { data, error } = yield database_1.supabase
                .from('location_settings')
                .select('memberships_enabled, leagues_enabled, marketing_enabled, promotions_enabled, door_lock_type, default_booking_window_days, default_booking_hours_start, default_booking_hours_end, booking_buffer_minutes, booking_grace_period_before_minutes, booking_grace_period_after_minutes, reservation_timeout_minutes')
                .eq('location_id', locationId)
                .single();
            if (error || !data) {
                return { membershipsEnabled: false, leaguesEnabled: true, marketingEnabled: false, promotionsEnabled: false, doorLockType: 'shelly', defaultBookingWindowDays: 7, defaultBookingHours: null, bookingBufferMinutes: 0, bookingGracePeriodBeforeMinutes: 0, bookingGracePeriodAfterMinutes: 0, reservationTimeoutMinutes: 2 };
            }
            return {
                membershipsEnabled: data.memberships_enabled,
                leaguesEnabled: data.leagues_enabled,
                marketingEnabled: (_a = data.marketing_enabled) !== null && _a !== void 0 ? _a : false,
                promotionsEnabled: (_b = data.promotions_enabled) !== null && _b !== void 0 ? _b : false,
                doorLockType: (_c = data.door_lock_type) !== null && _c !== void 0 ? _c : 'shelly',
                defaultBookingWindowDays: data.default_booking_window_days,
                defaultBookingHours: data.default_booking_hours_start && data.default_booking_hours_end
                    ? { start: data.default_booking_hours_start, end: data.default_booking_hours_end }
                    : null,
                bookingBufferMinutes: (_d = data.booking_buffer_minutes) !== null && _d !== void 0 ? _d : 0,
                bookingGracePeriodBeforeMinutes: (_e = data.booking_grace_period_before_minutes) !== null && _e !== void 0 ? _e : 0,
                bookingGracePeriodAfterMinutes: (_f = data.booking_grace_period_after_minutes) !== null && _f !== void 0 ? _f : 0,
                reservationTimeoutMinutes: (_g = data.reservation_timeout_minutes) !== null && _g !== void 0 ? _g : null,
            };
        });
    }
    updateLocationMembershipSettings(locationId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const updateFields = {};
            if (updates.membershipsEnabled !== undefined)
                updateFields.memberships_enabled = updates.membershipsEnabled;
            if (updates.leaguesEnabled !== undefined)
                updateFields.leagues_enabled = updates.leaguesEnabled;
            if (updates.marketingEnabled !== undefined)
                updateFields.marketing_enabled = updates.marketingEnabled;
            if (updates.promotionsEnabled !== undefined)
                updateFields.promotions_enabled = updates.promotionsEnabled;
            if (updates.doorLockType !== undefined) {
                if (!location_service_1.LocationService.isValidDoorLockType(updates.doorLockType)) {
                    throw new Error('Invalid door lock type');
                }
                updateFields.door_lock_type = updates.doorLockType;
            }
            if (updates.defaultBookingWindowDays !== undefined)
                updateFields.default_booking_window_days = updates.defaultBookingWindowDays;
            if (updates.defaultBookingHours !== undefined) {
                updateFields.default_booking_hours_start = (_b = (_a = updates.defaultBookingHours) === null || _a === void 0 ? void 0 : _a.start) !== null && _b !== void 0 ? _b : null;
                updateFields.default_booking_hours_end = (_d = (_c = updates.defaultBookingHours) === null || _c === void 0 ? void 0 : _c.end) !== null && _d !== void 0 ? _d : null;
            }
            if (updates.bookingBufferMinutes !== undefined) {
                if (updates.bookingBufferMinutes < 0 || updates.bookingBufferMinutes > 60 || updates.bookingBufferMinutes % 15 !== 0) {
                    throw new Error('Buffer must be 0, 15, 30, 45, or 60 minutes');
                }
                updateFields.booking_buffer_minutes = updates.bookingBufferMinutes;
            }
            if (updates.bookingGracePeriodBeforeMinutes !== undefined || updates.bookingGracePeriodAfterMinutes !== undefined) {
                // Fetch current settings for any fields not in this update payload
                let bufferMins = (_e = updates.bookingBufferMinutes) !== null && _e !== void 0 ? _e : updateFields.booking_buffer_minutes;
                let currentBefore = 0;
                let currentAfter = 0;
                if (bufferMins === undefined || updates.bookingGracePeriodBeforeMinutes === undefined || updates.bookingGracePeriodAfterMinutes === undefined) {
                    const { data: current } = yield database_1.supabase
                        .from('location_settings')
                        .select('booking_buffer_minutes, booking_grace_period_before_minutes, booking_grace_period_after_minutes')
                        .eq('location_id', locationId)
                        .single();
                    if (bufferMins === undefined)
                        bufferMins = (_f = current === null || current === void 0 ? void 0 : current.booking_buffer_minutes) !== null && _f !== void 0 ? _f : 0;
                    currentBefore = (_g = current === null || current === void 0 ? void 0 : current.booking_grace_period_before_minutes) !== null && _g !== void 0 ? _g : 0;
                    currentAfter = (_h = current === null || current === void 0 ? void 0 : current.booking_grace_period_after_minutes) !== null && _h !== void 0 ? _h : 0;
                }
                const before = (_j = updates.bookingGracePeriodBeforeMinutes) !== null && _j !== void 0 ? _j : currentBefore;
                const after = (_k = updates.bookingGracePeriodAfterMinutes) !== null && _k !== void 0 ? _k : currentAfter;
                if (before < 0 || after < 0)
                    throw new Error('Grace period cannot be negative');
                if (before + after > bufferMins) {
                    throw new Error(`Total grace period (${before} + ${after} = ${before + after}) cannot exceed the buffer (${bufferMins} min)`);
                }
                if (updates.bookingGracePeriodBeforeMinutes !== undefined)
                    updateFields.booking_grace_period_before_minutes = before;
                if (updates.bookingGracePeriodAfterMinutes !== undefined)
                    updateFields.booking_grace_period_after_minutes = after;
            }
            if (updates.reservationTimeoutMinutes !== undefined) {
                if (updates.reservationTimeoutMinutes !== null) {
                    if (updates.reservationTimeoutMinutes < 1 || updates.reservationTimeoutMinutes > 30) {
                        throw new Error('Reservation timeout must be between 1 and 30 minutes');
                    }
                }
                updateFields.reservation_timeout_minutes = updates.reservationTimeoutMinutes;
            }
            const { error } = yield database_1.supabase
                .from('location_settings')
                .update(updateFields)
                .eq('location_id', locationId);
            if (error) {
                logger_1.logger.error({ err: error }, 'Error updating location settings');
                throw new Error('Failed to update settings');
            }
            // When memberships are disabled, cancel all active subscriptions at period end
            if (updates.membershipsEnabled === false) {
                const stripeOpts = yield (0, stripe_1.getStripeOptions)(locationId);
                const { data: activeMembers } = yield database_1.supabase
                    .from('memberships')
                    .select('id, stripe_subscription_id')
                    .eq('location_id', locationId)
                    .in('status', ['active', 'trialing'])
                    .is('canceled_at', null);
                if (activeMembers && activeMembers.length > 0) {
                    let canceledCount = 0;
                    for (const member of activeMembers) {
                        try {
                            yield stripe_1.stripe.subscriptions.update(member.stripe_subscription_id, {
                                cancel_at_period_end: true,
                            }, stripeOpts);
                            yield database_1.supabase
                                .from('memberships')
                                .update({ canceled_at: new Date().toISOString() })
                                .eq('id', member.id);
                            canceledCount++;
                        }
                        catch (err) {
                            logger_1.logger.error({ err, membershipId: member.id }, 'Failed to cancel subscription at period end');
                        }
                    }
                    logger_1.logger.info({ locationId, canceledCount, total: activeMembers.length }, 'Memberships disabled — subscriptions set to cancel at period end');
                }
            }
        });
    }
}
exports.MembershipService = MembershipService;
