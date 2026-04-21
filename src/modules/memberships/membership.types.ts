import type { DoorLockType, BookingFlowMode } from '../locations/location.service';

export type { BookingFlowMode };

export interface MembershipBenefits {
  discountType?: 'fixed' | 'percentage' | null;
  discountValue?: number;
  freeMinutesPerMonth?: number;
  bookingWindowDays?: number;
  extendedHoursStart?: string;
  extendedHoursEnd?: string;
  guestPassesPerMonth?: number;
}

export interface MembershipPlan {
  id: string;
  location_id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  annual_price: number | null;
  stripe_product_id: string | null;
  stripe_monthly_price_id: string | null;
  stripe_annual_price_id: string | null;
  benefits: MembershipBenefits;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  plan_id: string;
  location_id: string;
  stripe_subscription_id: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  billing_interval: 'monthly' | 'annual';
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  free_minutes_used: number;
  guest_passes_used: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanBody {
  locationId: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  annualPrice?: number;
  benefits: MembershipBenefits;
  sortOrder?: number;
}

export interface UpdatePlanBody {
  name?: string;
  description?: string;
  monthlyPrice?: number;
  annualPrice?: number;
  benefits?: MembershipBenefits;
  sortOrder?: number;
  isActive?: boolean;
}

export interface SubscribeBody {
  planId: string;
  billingInterval: 'monthly' | 'annual';
}

export const VALID_BOOKING_FLOW_MODES: BookingFlowMode[] = ['auth_first', 'late_auth', 'guest_checkout', 'members_only'];

export interface LocationMembershipSettings {
  membershipsEnabled: boolean;
  leaguesEnabled: boolean;
  marketingEnabled: boolean;
  promotionsEnabled: boolean;
  kioskFeatureEnabled: boolean;
  bookingFlowMode: BookingFlowMode;
  doorLockType: DoorLockType;
  defaultBookingWindowDays: number;
  defaultBookingHours: { start: string; end: string } | null;
  bookingBufferMinutes: number;
  bookingGracePeriodBeforeMinutes: number;
  bookingGracePeriodAfterMinutes: number;
  reservationTimeoutMinutes: number | null;
  guestReservationHoldEnabled: boolean;
  cancellationPolicyHours: number;
  brandPrimaryColor: string;
  brandLogoUrl: string | null;
  customDomain: string | null;
}
