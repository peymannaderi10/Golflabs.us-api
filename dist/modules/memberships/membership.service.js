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
            // Create Stripe Product
            const product = yield stripe_1.stripe.products.create({
                name,
                description: description || undefined,
                metadata: { location_id: locationId },
            });
            // Create monthly Stripe Price
            const monthlyStripePrice = yield stripe_1.stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(monthlyPrice * 100),
                currency: 'usd',
                recurring: { interval: 'month' },
                metadata: { location_id: locationId, interval: 'monthly' },
            });
            // Optionally create annual Stripe Price
            let annualStripePrice = null;
            if (annualPrice != null) {
                annualStripePrice = yield stripe_1.stripe.prices.create({
                    product: product.id,
                    unit_amount: Math.round(annualPrice * 100),
                    currency: 'usd',
                    recurring: { interval: 'year' },
                    metadata: { location_id: locationId, interval: 'annual' },
                });
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
                console.error('Error creating membership plan:', error);
                throw new Error('Failed to create membership plan');
            }
            return plan;
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
            // Price changes: create new Stripe Prices on the same Product
            if (data.monthlyPrice !== undefined || data.annualPrice !== undefined) {
                const { data: existing, error: fetchErr } = yield database_1.supabase
                    .from('membership_plans')
                    .select('stripe_product_id, monthly_price, annual_price')
                    .eq('id', planId)
                    .single();
                if (fetchErr || !(existing === null || existing === void 0 ? void 0 : existing.stripe_product_id)) {
                    throw new Error('Plan not found');
                }
                if (data.monthlyPrice !== undefined && data.monthlyPrice !== existing.monthly_price) {
                    const newPrice = yield stripe_1.stripe.prices.create({
                        product: existing.stripe_product_id,
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
                    }
                    else {
                        const newPrice = yield stripe_1.stripe.prices.create({
                            product: existing.stripe_product_id,
                            unit_amount: Math.round(data.annualPrice * 100),
                            currency: 'usd',
                            recurring: { interval: 'year' },
                        });
                        updates.annual_price = data.annualPrice;
                        updates.stripe_annual_price_id = newPrice.id;
                    }
                }
            }
            // Also update the Stripe Product name/description if changed
            if (data.name !== undefined || data.description !== undefined) {
                const { data: plan } = yield database_1.supabase
                    .from('membership_plans')
                    .select('stripe_product_id')
                    .eq('id', planId)
                    .single();
                if (plan === null || plan === void 0 ? void 0 : plan.stripe_product_id) {
                    const productUpdate = {};
                    if (data.name !== undefined)
                        productUpdate.name = data.name;
                    if (data.description !== undefined)
                        productUpdate.description = data.description || '';
                    yield stripe_1.stripe.products.update(plan.stripe_product_id, productUpdate);
                }
            }
            const { data: updated, error } = yield database_1.supabase
                .from('membership_plans')
                .update(updates)
                .eq('id', planId)
                .select()
                .single();
            if (error) {
                console.error('Error updating membership plan:', error);
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
                console.error('Error deactivating membership plan:', error);
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
                console.error('Error fetching membership plans:', error);
                throw new Error('Failed to fetch membership plans');
            }
            return data || [];
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
            // Clean up any orphaned incomplete memberships (e.g. user started checkout but never paid)
            const { data: incompleteRows } = yield database_1.supabase
                .from('memberships')
                .select('id, stripe_subscription_id')
                .eq('user_id', userId)
                .eq('location_id', plan.location_id)
                .eq('status', 'incomplete');
            if (incompleteRows && incompleteRows.length > 0) {
                for (const row of incompleteRows) {
                    try {
                        yield stripe_1.stripe.subscriptions.cancel(row.stripe_subscription_id);
                    }
                    catch (cancelErr) {
                        console.warn(`Failed to cancel orphaned Stripe subscription ${row.stripe_subscription_id}:`, cancelErr.message);
                    }
                    yield database_1.supabase.from('memberships').delete().eq('id', row.id);
                }
                console.log(`Cleaned up ${incompleteRows.length} incomplete membership(s) for user ${userId}`);
            }
            // 3. Ensure Stripe Customer
            const { data: profile, error: profileErr } = yield database_1.supabase
                .from('user_profiles')
                .select('stripe_customer_id, email, full_name')
                .eq('id', userId)
                .single();
            if (profileErr || !profile)
                throw new Error('User profile not found');
            let stripeCustomerId = profile.stripe_customer_id;
            // Verify the stored customer still exists in Stripe (handles prod/sandbox mismatch)
            if (stripeCustomerId) {
                try {
                    yield stripe_1.stripe.customers.retrieve(stripeCustomerId);
                }
                catch (err) {
                    if (err.code === 'resource_missing') {
                        console.warn(`Stored Stripe customer ${stripeCustomerId} not found, creating new one for user ${userId}`);
                        stripeCustomerId = null;
                    }
                    else {
                        throw err;
                    }
                }
            }
            if (!stripeCustomerId) {
                const customer = yield stripe_1.stripe.customers.create({
                    email: profile.email,
                    name: profile.full_name || undefined,
                    metadata: { user_id: userId },
                });
                stripeCustomerId = customer.id;
                yield database_1.supabase
                    .from('user_profiles')
                    .update({ stripe_customer_id: customer.id })
                    .eq('id', userId);
            }
            // 4. Create Stripe Subscription with payment_behavior: 'default_incomplete'
            // so the frontend can collect payment via Elements
            const subscription = yield stripe_1.stripe.subscriptions.create({
                customer: stripeCustomerId,
                items: [{ price: priceId }],
                payment_behavior: 'default_incomplete',
                payment_settings: {
                    save_default_payment_method: 'on_subscription',
                },
                expand: ['latest_invoice.payment_intent'],
                metadata: {
                    user_id: userId,
                    plan_id: planId,
                    location_id: plan.location_id,
                },
            });
            // 5. Insert membership row (status will be updated by webhook when payment succeeds)
            const { data: membership, error: membershipErr } = yield database_1.supabase
                .from('memberships')
                .insert({
                user_id: userId,
                plan_id: planId,
                location_id: plan.location_id,
                stripe_subscription_id: subscription.id,
                status: 'incomplete',
                billing_interval: billingInterval,
                current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
                current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
            })
                .select('id')
                .single();
            if (membershipErr) {
                console.error('Error creating membership record:', membershipErr);
                yield stripe_1.stripe.subscriptions.cancel(subscription.id);
                throw new Error('Failed to create membership');
            }
            // Extract client secret from the latest invoice's payment intent
            const invoice = subscription.latest_invoice;
            const paymentIntent = invoice === null || invoice === void 0 ? void 0 : invoice.payment_intent;
            const clientSecret = (paymentIntent === null || paymentIntent === void 0 ? void 0 : paymentIntent.client_secret) || null;
            return {
                clientSecret,
                membershipId: membership.id,
                subscriptionId: subscription.id,
            };
        });
    }
    cancelMembership(membershipId_1, userId_1) {
        return __awaiter(this, arguments, void 0, function* (membershipId, userId, immediate = false) {
            const { data: membership, error: fetchErr } = yield database_1.supabase
                .from('memberships')
                .select('id, stripe_subscription_id, user_id, status, plan_id, location_id, billing_interval, current_period_end')
                .eq('id', membershipId)
                .single();
            if (fetchErr || !membership)
                throw new Error('Membership not found');
            if (membership.user_id !== userId)
                throw new Error('Access denied');
            if (!['active', 'trialing', 'past_due'].includes(membership.status)) {
                throw new Error('This membership cannot be canceled (current status: ' + membership.status + ')');
            }
            if (immediate) {
                // Cancel immediately with prorated refund
                const deletedSub = yield stripe_1.stripe.subscriptions.cancel(membership.stripe_subscription_id, {
                    prorate: true,
                    invoice_now: true,
                });
                // Stripe creates a final invoice with prorated credits.
                // Retrieve the latest invoice to find the credit amount.
                let refundAmount = 0;
                try {
                    const invoices = yield stripe_1.stripe.invoices.list({
                        subscription: membership.stripe_subscription_id,
                        limit: 1,
                    });
                    const finalInvoice = invoices.data[0];
                    if (finalInvoice && finalInvoice.amount_due < 0) {
                        // Negative amount = credit owed to customer
                        refundAmount = Math.abs(finalInvoice.amount_due);
                    }
                    else if (finalInvoice && finalInvoice.ending_balance && finalInvoice.ending_balance < 0) {
                        refundAmount = Math.abs(finalInvoice.ending_balance);
                    }
                    if (refundAmount > 0 && deletedSub.latest_invoice) {
                        const latestInvoice = yield stripe_1.stripe.invoices.retrieve(deletedSub.latest_invoice);
                        const chargeId = latestInvoice.charge;
                        if (chargeId) {
                            yield stripe_1.stripe.refunds.create({
                                charge: chargeId,
                                amount: refundAmount,
                                reason: 'requested_by_customer',
                            });
                            console.log(`Issued prorated refund of $${(refundAmount / 100).toFixed(2)} for membership ${membershipId}`);
                        }
                        else {
                            console.warn(`No charge found on latest invoice for membership ${membershipId}, skipping refund`);
                        }
                    }
                }
                catch (refundErr) {
                    console.error(`Error processing prorated refund for membership ${membershipId}:`, refundErr);
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
            });
            yield database_1.supabase
                .from('memberships')
                .update({ canceled_at: new Date().toISOString() })
                .eq('id', membershipId);
            this.sendCancellationEmail(membership, 'end_of_period');
            return {};
        });
    }
    changePlan(membershipId, userId, newPlanId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: membership, error: fetchErr } = yield database_1.supabase
                .from('memberships')
                .select('id, stripe_subscription_id, user_id, location_id, billing_interval, status')
                .eq('id', membershipId)
                .single();
            if (fetchErr || !membership)
                throw new Error('Membership not found');
            if (membership.user_id !== userId)
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
            // Get current subscription items
            const sub = yield stripe_1.stripe.subscriptions.retrieve(membership.stripe_subscription_id);
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
            });
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
                yield email_service_1.EmailService.sendMembershipCanceledEmail(emailData);
            }
            catch (err) {
                console.error('Failed to send membership cancellation email:', err);
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
                console.error('Error fetching user membership:', error);
                throw new Error('Failed to fetch membership');
            }
            if (!data)
                return null;
            // Auto-sync from Stripe if local status is stale (e.g. webhook failed)
            if (data.status === 'incomplete' && data.stripe_subscription_id) {
                try {
                    const synced = yield this.syncFromStripe(data.id, data.stripe_subscription_id);
                    if (synced) {
                        const { membership_plans } = synced, membership = __rest(synced, ["membership_plans"]);
                        return Object.assign(Object.assign({}, membership), { plan: membership_plans });
                    }
                }
                catch (syncErr) {
                    console.error('Auto-sync from Stripe failed:', syncErr);
                }
            }
            const { membership_plans } = data, membership = __rest(data, ["membership_plans"]);
            return Object.assign(Object.assign({}, membership), { plan: membership_plans });
        });
    }
    syncFromStripe(membershipId, stripeSubscriptionId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sub = yield stripe_1.stripe.subscriptions.retrieve(stripeSubscriptionId);
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
                console.error(`Failed to sync subscription ${stripeSubscriptionId} from Stripe:`, err);
                return null;
            }
        });
    }
    getSubscribersForLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!locationId)
                throw new Error('Location ID is required');
            const { data, error } = yield database_1.supabase
                .from('memberships')
                .select('*, membership_plans(name, monthly_price, annual_price), user_profiles(email, full_name, phone)')
                .eq('location_id', locationId)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Error fetching subscribers:', error);
                throw new Error('Failed to fetch subscribers');
            }
            return data || [];
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
                console.error('Error logging membership usage:', error);
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
                console.error('Error fetching active membership:', error);
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
            const { data, error } = yield database_1.supabase
                .from('location_settings')
                .select('memberships_enabled, leagues_enabled, default_booking_window_days, default_booking_hours_start, default_booking_hours_end')
                .eq('location_id', locationId)
                .single();
            if (error || !data) {
                return { membershipsEnabled: false, leaguesEnabled: true, defaultBookingWindowDays: 7, defaultBookingHours: null };
            }
            return {
                membershipsEnabled: data.memberships_enabled,
                leaguesEnabled: data.leagues_enabled,
                defaultBookingWindowDays: data.default_booking_window_days,
                defaultBookingHours: data.default_booking_hours_start && data.default_booking_hours_end
                    ? { start: data.default_booking_hours_start, end: data.default_booking_hours_end }
                    : null,
            };
        });
    }
    updateLocationMembershipSettings(locationId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const updateFields = {};
            if (updates.membershipsEnabled !== undefined)
                updateFields.memberships_enabled = updates.membershipsEnabled;
            if (updates.leaguesEnabled !== undefined)
                updateFields.leagues_enabled = updates.leaguesEnabled;
            if (updates.defaultBookingWindowDays !== undefined)
                updateFields.default_booking_window_days = updates.defaultBookingWindowDays;
            if (updates.defaultBookingHours !== undefined) {
                updateFields.default_booking_hours_start = (_b = (_a = updates.defaultBookingHours) === null || _a === void 0 ? void 0 : _a.start) !== null && _b !== void 0 ? _b : null;
                updateFields.default_booking_hours_end = (_d = (_c = updates.defaultBookingHours) === null || _c === void 0 ? void 0 : _c.end) !== null && _d !== void 0 ? _d : null;
            }
            const { error } = yield database_1.supabase
                .from('location_settings')
                .update(updateFields)
                .eq('location_id', locationId);
            if (error) {
                console.error('Error updating location settings:', error);
                throw new Error('Failed to update settings');
            }
        });
    }
}
exports.MembershipService = MembershipService;
