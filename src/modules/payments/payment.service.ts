import { stripe } from '../../config/stripe';
import { supabase } from '../../config/database';
import { CreatePaymentForBookingBody, UpdatePaymentIntentRequest } from './payment.types';
import { promotionService } from '../promotions/promotion.service';
import { MembershipService } from '../memberships/membership.service';

export class PaymentService {
  async createPaymentIntent(
    bookingId: string, 
    amount: number, 
    promotionInfo?: {
      promotionId: string;
      discountAmount: number;
      freeMinutes?: number;
      originalAmount: number;
    },
    memberPricingInfo?: {
      membershipId: string;
      freeMinutesApplied: number;
    }
  ) {
    if (amount === undefined) {
      throw new Error('Amount is required');
    }
    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    // 1. Verify the booking is valid for payment
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, status, expires_at, user_id, bay_id, location_id, created_at, total_amount')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      console.error(`Booking ${bookingId} not found:`, fetchError);
      throw new Error('Booking not found.');
    }

    console.log(`Payment intent requested for booking ${bookingId}:`, {
      status: booking.status,
      expires_at: booking.expires_at,
      created_at: booking.created_at,
      user_id: booking.user_id
    });

    if (booking.status !== 'reserved') {
      console.error(`Booking ${bookingId} has invalid status for payment: ${booking.status}`);
      throw new Error(`Booking cannot be paid for. Status: ${booking.status}`);
    }

    // Check expiration using UTC timestamp comparison
    const now = new Date().toISOString();
    if (booking.expires_at < now) {
      // The reservation has expired, update its status
      await supabase
        .from('bookings')
        .update({ status: 'expired' })
        .eq('id', bookingId)
        .eq('status', 'reserved');
      throw new Error('Booking reservation has expired.');
    }

    // 2. Check if a payment intent already exists for this booking
    const { data: existingPayment, error: paymentCheckError } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, status')
      .eq('booking_id', bookingId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (paymentCheckError && paymentCheckError.code !== 'PGRST116') {
      console.error('Error checking existing payments:', paymentCheckError);
      throw paymentCheckError;
    }

    // If we found an existing pending/processing payment, retrieve the intent
    if (existingPayment?.stripe_payment_intent_id) {
      const existingId = existingPayment.stripe_payment_intent_id;
      const isSetupIntent = existingId.startsWith('seti_');

      try {
        if (isSetupIntent) {
          const existingSetupIntent = await stripe.setupIntents.retrieve(existingId);
          if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existingSetupIntent.status)) {
            console.log(`Reusing existing setup intent ${existingSetupIntent.id} for booking ${bookingId}`);
            return {
              clientSecret: existingSetupIntent.client_secret,
              bookingId: booking.id,
              type: 'setup' as const
            };
          } else {
            console.log(`Existing setup intent ${existingSetupIntent.id} has status ${existingSetupIntent.status}, creating new one`);
          }
        } else {
          const existingPaymentIntent = await stripe.paymentIntents.retrieve(existingId);
          if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(existingPaymentIntent.status)) {
            console.log(`Reusing existing payment intent ${existingPaymentIntent.id} for booking ${bookingId}`);
            return {
              clientSecret: existingPaymentIntent.client_secret,
              bookingId: booking.id,
              type: 'payment' as const
            };
          } else {
            console.log(`Existing payment intent ${existingPaymentIntent.id} has status ${existingPaymentIntent.status}, creating new one`);
          }
        }
      } catch (stripeError) {
        console.error('Error retrieving existing Stripe intent from Stripe:', stripeError);
      }
    }

    // 3. Ensure user has a Stripe Customer (for saving cards for future off-session charges)
    let stripeCustomerId: string | null = null;
    try {
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id, email')
        .eq('id', booking.user_id)
        .single();

      if (!userError && userProfile) {
        if (userProfile.stripe_customer_id) {
          try {
            await stripe.customers.retrieve(userProfile.stripe_customer_id);
            stripeCustomerId = userProfile.stripe_customer_id;
            console.log(`Using existing Stripe customer ${stripeCustomerId} for user ${booking.user_id}`);
          } catch (err: any) {
            if (err.code === 'resource_missing') {
              console.warn(`Stored Stripe customer ${userProfile.stripe_customer_id} not found, will create new one`);
            } else {
              throw err;
            }
          }
        }
        if (!stripeCustomerId && userProfile.email) {
          // Create a new Stripe Customer
          const customer = await stripe.customers.create({
            email: userProfile.email,
            metadata: { user_id: booking.user_id }
          });
          stripeCustomerId = customer.id;

          // Save the Stripe Customer ID to user_profiles
          await supabase
            .from('user_profiles')
            .update({ stripe_customer_id: customer.id })
            .eq('id', booking.user_id);

          console.log(`Created new Stripe customer ${customer.id} for user ${booking.user_id}`);
        }
      }
    } catch (customerError: any) {
      console.error(`Error setting up Stripe customer for user ${booking.user_id}:`, customerError.message);
      // Continue without customer - payment will still work, just won't save card
    }

    // 4. If promotion info is provided, update the booking with discount info
    if (promotionInfo && promotionInfo.promotionId) {
      const { error: updateBookingError } = await supabase
        .from('bookings')
        .update({
          original_amount: promotionInfo.originalAmount,
          discount_amount: promotionInfo.discountAmount,
          promotion_id: promotionInfo.promotionId,
          total_amount: amount / 100 // Update total to discounted amount in dollars
        })
        .eq('id', bookingId);

      if (updateBookingError) {
        console.error('Error updating booking with promotion info:', updateBookingError);
        // Continue anyway, the booking can still be paid
      } else {
        console.log(`Updated booking ${bookingId} with promotion discount: $${promotionInfo.discountAmount}`);
      }
    }

    const intentMetadata: Record<string, string> = {
      booking_id: booking.id,
      user_id: booking.user_id,
      bay_id: booking.bay_id,
      location_id: booking.location_id,
      promotion_id: promotionInfo?.promotionId || '',
      discount_amount: promotionInfo?.discountAmount?.toString() || '0',
      free_minutes: promotionInfo?.freeMinutes?.toString() || '0',
      original_amount: promotionInfo?.originalAmount?.toString() || (amount / 100).toString()
    };

    if (memberPricingInfo?.membershipId) {
      intentMetadata.membership_id = memberPricingInfo.membershipId;
      intentMetadata.member_free_minutes_applied = memberPricingInfo.freeMinutesApplied.toString();
    }

    // 5. Free booking (amount = 0): create SetupIntent to save card for future charges
    if (amount === 0) {
      if (!stripeCustomerId) {
        throw new Error('A Stripe customer is required for free bookings to save payment method.');
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: intentMetadata,
        usage: 'off_session',
      });

      // Create a $0 payment record linked to the setup intent
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: booking.id,
          amount: 0,
          status: 'pending',
          stripe_payment_intent_id: setupIntent.id,
          currency: 'usd',
          user_id: booking.user_id,
          location_id: booking.location_id
        });

      if (paymentError) {
        await stripe.setupIntents.cancel(setupIntent.id);
        console.error('Error creating payment record for free booking, cancelling setup intent:', paymentError);
        throw paymentError;
      }

      console.log(`Created setup intent ${setupIntent.id} for free booking ${bookingId} (discount: $${promotionInfo?.discountAmount || 0})`);

      return {
        clientSecret: setupIntent.client_secret,
        bookingId: booking.id,
        type: 'setup' as const
      };
    }

    // 6. Paid booking: create Stripe Payment Intent (with customer + save card for future use)
    const paymentIntentParams: any = {
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: intentMetadata
    };

    // Attach Stripe Customer and save card for future off-session charges (extensions)
    if (stripeCustomerId) {
      paymentIntentParams.customer = stripeCustomerId;
      paymentIntentParams.setup_future_usage = 'off_session';
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // 7. Create a corresponding payment record
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        booking_id: booking.id,
        amount: amount / 100,
        status: 'pending',
        stripe_payment_intent_id: paymentIntent.id,
        currency: 'usd',
        user_id: booking.user_id,
        location_id: booking.location_id
      });
    
    if (paymentError) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      console.error('Error creating payment record, cancelling payment intent:', paymentError);
      throw paymentError;
    }

    console.log(`Created new payment intent ${paymentIntent.id} for booking ${bookingId} (amount: $${amount / 100}, discount: $${promotionInfo?.discountAmount || 0})`);

    // 8. Send the client secret back to the frontend
    return {
      clientSecret: paymentIntent.client_secret,
      bookingId: booking.id,
      type: 'payment' as const
    };
  }

  async updatePaymentIntent(data: UpdatePaymentIntentRequest) {
    const { paymentIntentId, email, firstName, lastName, phone } = data;

    const existing = await stripe.paymentIntents.retrieve(paymentIntentId);

    const paymentIntent = await stripe.paymentIntents.update(paymentIntentId, {
      receipt_email: email,
      metadata: { ...existing.metadata, firstName, lastName, phone },
    });

    return { success: true, paymentIntent };
  }

  async getPaymentIntentStatus(paymentIntentId: string) {
    if (!paymentIntentId) {
      throw new Error("Payment Intent ID is required");
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    };
  }

  async getSetupIntentStatus(setupIntentId: string) {
    if (!setupIntentId) {
      throw new Error('Setup Intent ID is required');
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    return {
      status: setupIntent.status,
      amount: 0,
      currency: 'usd'
    };
  }

  async calculatePrice(locationId: string, startTime: string, endTime: string, userId?: string) {
    if (!locationId || !startTime || !endTime) {
      throw new Error('locationId, startTime, and endTime are required');
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      throw new Error('Invalid startTime or endTime');
    }

    // Get location timezone for proper pricing rule application
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    if (locationError || !location) {
      throw new Error('Invalid location ID');
    }

    const timezone = location.timezone || 'America/New_York';

    const { data: rules, error: rulesError } = await supabase
      .from('pricing_rules')
      .select('name, hourly_rate, start_time, end_time, days_of_week')
      .eq('location_id', locationId);

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      throw new Error('No pricing rules found for this location');
    }
    
    let total = 0;
    const breakdown = [];
    let cursorTime = new Date(startDate);
    
    let currentSegment: { rateName: string; start: string; rate: number; } | null = null;

    while (cursorTime < endDate) {
      // Convert UTC time to local time for pricing rule determination
      const localHour = parseInt(cursorTime.toLocaleString('en-US', { 
        hour: '2-digit', 
        hour12: false, 
        timeZone: timezone 
      }));
      
      // Determine which rate applies based on LOCAL time
      let rule;
      if (localHour >= 9 || localHour < 2) {
        // Standard Rate: 9am-2am (local time)
        rule = rules.find(r => r.name === "Standard Rate");
      } else {
        // Off-Peak Rate: 2am-9am (local time)
        rule = rules.find(r => r.name === "Off-Peak Rate");
      }

      if (!rule) {
        throw new Error(`No pricing rule found for ${cursorTime.toISOString()} (local hour: ${localHour})`);
      }

      const priceForSlot = (rule.hourly_rate * 100) / 4; // price in cents for 15 mins

      if (!currentSegment || currentSegment.rateName !== rule.name) {
        if (currentSegment) {
          breakdown.push({
            rateName: currentSegment.rateName,
            start: currentSegment.start,
            rate: currentSegment.rate,
            end: cursorTime.toISOString(),
          });
        }
        currentSegment = {
          rateName: rule.name,
          start: cursorTime.toISOString(),
          rate: 0,
        };
      }
      
      currentSegment.rate += priceForSlot;
      total += priceForSlot;

      cursorTime.setUTCMinutes(cursorTime.getUTCMinutes() + 15);
    }

    if (currentSegment) {
      breakdown.push({
        rateName: currentSegment.rateName,
        start: currentSegment.start,
        rate: currentSegment.rate,
        end: endDate.toISOString(),
      });
    }

    // Apply membership benefits if user is a member
    let memberDiscount = 0;
    let freeMinutesApplied = 0;
    let membershipId: string | null = null;
    const regularTotal = total;

    if (userId) {
      try {
        const membershipService = new MembershipService();
        const membership = await membershipService.getActiveMembershipForUser(userId, locationId);

        if (membership) {
          membershipId = membership.id;
          const benefits = membership.benefits;
          const totalMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);

          // 1. Apply free minutes first
          if (benefits.freeMinutesPerMonth && benefits.freeMinutesPerMonth > 0) {
            const remainingFreeMinutes = benefits.freeMinutesPerMonth - (membership.free_minutes_used || 0);
            if (remainingFreeMinutes > 0) {
              const minutesToApply = Math.min(remainingFreeMinutes, totalMinutes);
              const slotsToCredit = Math.floor(minutesToApply / 15);
              if (slotsToCredit > 0) {
                // Calculate the value of free slots using average slot price
                const avgSlotPrice = total / (totalMinutes / 15);
                const freeCredit = Math.round(slotsToCredit * avgSlotPrice);
                freeMinutesApplied = slotsToCredit * 15;
                total = Math.max(0, total - freeCredit);
              }
            }
          }

          // 2. Apply discount on remaining amount
          if (benefits.discountType && benefits.discountValue && benefits.discountValue > 0 && total > 0) {
            if (benefits.discountType === 'fixed') {
              memberDiscount = Math.min(Math.round(benefits.discountValue * 100), total);
            } else if (benefits.discountType === 'percentage') {
              memberDiscount = Math.round(total * (benefits.discountValue / 100));
            }
            total = Math.max(0, total - memberDiscount);
          }
        }
      } catch (memberErr) {
        console.error('Error checking membership for price calculation:', memberErr);
        // Non-fatal: proceed with regular pricing
      }
    }
    
    return {
      total,
      currency: 'usd',
      breakdown,
      memberPricing: membershipId ? {
        membershipId,
        regularTotal,
        memberDiscount,
        freeMinutesApplied,
        finalTotal: total,
      } : null,
    };
  }
} 